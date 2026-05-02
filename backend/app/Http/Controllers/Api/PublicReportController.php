<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Report;
use App\Models\User;
use App\Services\AuditService;
use App\Services\StakeholderNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;

class PublicReportController extends Controller
{
    use ReportControllerHelpers;

    public function __construct(
        protected AuditService $auditService,
        protected StakeholderNotificationService $notificationService,
    ) {}

    public function storeAnonymous(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            //'type'        => ['required', 'string', 'max:255'],
            'institution' => ['required', 'string', 'max:255'],
            'location'    => ['nullable', 'string', 'max:255'],
            'description' => ['required', 'string', 'min:20'],
            'report_language' => ['sometimes', 'string', 'max:10'],
            // priority is no longer accepted from the user — it is assigned by the expert system
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation error',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $validated = $validator->validated();

        $typeInference = $this->inferCorruptionType($validated);
        $validated['type'] = $typeInference['resolved_type'];

        // Expert system determines priority
        $expertPriority = $this->determineExpertPriority($validated);

        // Text clarity check — reject clearly gibberish submissions
        $clarity = $this->lastClarityResult;
        if (!empty($clarity) && $clarity['score'] < 20) {
            return response()->json([
                'success' => false,
                'message' => 'Your report description appears to be unclear or contains unrecognizable text. Please write a clear description of the corruption incident in English, Shona, Ndebele, or Tonga.',
                'clarity' => [
                    'score' => $clarity['score'],
                    'issues' => $clarity['issues'] ?? [],
                ],
            ], 422);
        }

        // Always auto-detect language from text content, falling back to declared/default
        $detectedLang = $this->detectTextLanguage($validated['description']);
        $reportLanguage = $detectedLang ?: ($validated['report_language'] ?? 'en');
        $clarityScore = $clarity['score'] ?? 50;

        try {
            $report = DB::transaction(function () use ($validated, $expertPriority, $request, $reportLanguage, $clarityScore) {
                $report = new Report([
                    'case_id'      => Report::generateCaseId(),
                    'reference_code' => Report::generateReferenceCode(),
                    'user_id'      => null,
                    'type'         => $validated['type'],
                    'institution'  => $validated['institution'],
                    'location'     => $validated['location'] ?? null,
                    'status'       => 'SUBMITTED',
                    'priority'     => $expertPriority,
                    'risk_score'   => $this->calculateRiskScore(array_merge($validated, ['priority' => $expertPriority])),
                    'last_updated' => now(),
                    'ip_address'   => $request->ip(),
                    'user_agent'   => $request->userAgent(),
                    'is_anonymous' => true,
                    'is_encrypted' => true,
                    'report_language' => $reportLanguage,
                    'text_clarity_score' => $clarityScore,
                ]);

                // Encrypt sensitive data (AES-256 via Laravel Crypt)
                $report->setEncryptedData([
                    'description' => $validated['description'],
                    'location'    => $validated['location'] ?? null,
                    'institution' => $validated['institution'],
                ]);

                $report->save();

                // Persist correction metadata for audit view.
                $report->ai_summary = array_merge(
                    is_array($report->ai_summary) ? $report->ai_summary : [],
                    [
                        'type_inference' => [
                            'selected_type' => $this->lastTypeInference['selected_type'] ?? $report->type,
                            'inferred_type' => $this->lastTypeInference['inferred_type'] ?? $report->type,
                            'resolved_type' => $this->lastTypeInference['resolved_type'] ?? $report->type,
                            'was_corrected' => (bool) ($this->lastTypeInference['was_corrected'] ?? false),
                            'confidence' => (int) ($this->lastTypeInference['confidence'] ?? 0),
                            'captured_at' => now()->toIso8601String(),
                        ],
                    ]
                );
                $report->save();

                $report->submitToBlockchain();

                return $report;
            });

            // Run AI classification (non-blocking — stores results in ai_summary)
            $this->runAIClassification($report, $validated);

            $this->auditService->record(
                action: 'ANONYMOUS_REPORT_SUBMITTED',
                subject: $report,
                reportId: $report->id,
                userId: null,
                details: 'Anonymous report submitted via public portal',
                metadata: [
                    'case_id' => $report->case_id,
                    'reference_code' => $report->reference_code,
                ],
            );

            $this->notificationService->notifyCaseEvent(
                $report,
                'ANONYMOUS_REPORT_SUBMITTED',
                'New Anonymous Report Submitted',
                'A new anonymous case has been submitted and requires review.',
                [
                    'case_id' => $report->case_id,
                    'reference_code' => $report->reference_code,
                    'priority' => $report->priority,
                ],
            );

            return response()->json([
                'success' => true,
                'message' => 'Anonymous report submitted successfully',
                'data' => [
                    'case_id' => $report->case_id,
                    'reference_code' => $report->reference_code,
                    'status' => $report->status,
                    'risk_score' => $report->risk_score,
                    'priority' => $report->priority,
                    'type' => $report->type,
                    'type_selected' => $typeInference['selected_type'] ?? $report->type,
                    'type_corrected' => $typeInference['was_corrected'] ?? false,
                    'type_confidence' => $typeInference['confidence'] ?? null,
                    'created_at' => $report->created_at,
                ],
            ], 201);
        } catch (\Throwable $e) {
            Log::error('Failed to submit anonymous report', [
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to submit report. Please try again.',
            ], 500);
        }
    }

    public function track(string $trackingCode): JsonResponse
    {
        $report = Report::query()
            ->where('reference_code', $trackingCode)
            ->orWhere('case_id', $trackingCode)
            ->first();

        if (!$report) {
            return response()->json([
                'success' => false,
                'message' => 'No case found for this tracking code.',
            ], 404);
        }

        $stageEvaluations = $report->stageEvaluations()
            ->oldest('created_at')
            ->get(['id', 'stage', 'investigator_notes', 'expert_score', 'manual_score', 'final_score', 'created_at']);

        $attachments = $report->attachments()->get(['id', 'original_name', 'mime_type', 'size'])->map(function ($att) use ($report) {
            return [
                'id' => $att->id,
                'original_name' => $att->original_name,
                'mime_type' => $att->mime_type,
                'size' => $att->size,
                'download_url' => "/api/reports/track/{$report->reference_code}/evidence/{$att->id}",
            ];
        });

        return response()->json([
            'success' => true,
            'data' => [
                'case_id' => $report->case_id,
                'reference_code' => $report->reference_code,
                'status' => $report->status,
                'priority' => $report->priority,
                'risk_score' => $report->risk_score,
                'institution' => $report->institution,
                'type' => $report->type,
                'created_at' => $report->created_at,
                'last_updated' => $report->last_updated,
                'dispute_reason' => $report->dispute_reason,
                'attachments_count' => $attachments->count(),
                'attachments' => $attachments,
                'stage_evaluations' => $stageEvaluations,
            ],
        ]);
    }

    public function publicDispute(string $trackingCode, Request $request): JsonResponse
    {
        $report = Report::query()
            ->where('reference_code', $trackingCode)
            ->orWhere('case_id', $trackingCode)
            ->first();

        if (!$report) {
            return response()->json(['success' => false, 'message' => 'No case found for this tracking code.'], 404);
        }

        if (!in_array($report->status, ['CLOSED', 'SUCCESSFUL'])) {
            return response()->json(['success' => false, 'message' => 'Only closed or successful cases can be disputed.'], 422);
        }

        $validator = Validator::make($request->all(), [
            'reason'     => ['required', 'string', 'min:10'],
            'evidence'   => ['nullable', 'array', 'max:10'],
            'evidence.*' => [
                'file',
                'max:10240',
                'mimetypes:image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/quicktime,video/x-msvideo,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain',
            ],
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation error', 'errors' => $validator->errors()], 422);
        }

        try {
            DB::transaction(function () use ($report, $request) {
                $report->status         = 'DISPUTED';
                $report->dispute_reason = $request->input('reason');
                $report->last_updated   = now();
                $report->save();

                if ($request->hasFile('evidence')) {
                    foreach ($request->file('evidence') as $file) {
                        $stored = $file->store('dispute_evidence/' . $report->case_id, 'local');
                        $report->attachments()->create([
                            'original_name' => $file->getClientOriginalName(),
                            'file_name'     => $stored,
                            'mime_type'     => $file->getMimeType(),
                            'size'          => $file->getSize(),
                            'disk'          => 'local',
                            'created_by'    => null,
                        ]);
                    }
                }
            });

            $this->auditService->record(
                action: 'CASE_DISPUTED',
                subject: $report,
                reportId: $report->id,
                userId: null,
                details: 'Case disputed via public portal.',
                metadata: ['case_id' => $report->case_id],
            );

            $this->notificationService->notifyCaseEvent(
                $report,
                'CASE_DISPUTED',
                'Case Dispute Filed',
                "Case {$report->reference_code} has been disputed by the whistleblower.",
                ['case_id' => $report->case_id],
            );

            return response()->json(['success' => true, 'message' => 'Dispute submitted successfully.', 'data' => ['status' => 'DISPUTED']]);
        } catch (\Throwable $e) {
            Log::error('Failed to process public dispute', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Failed to process dispute. Please try again.'], 500);
        }
    }

    public function uploadEvidence(string $trackingCode, Request $request): JsonResponse
    {
        $report = Report::query()
            ->where('reference_code', $trackingCode)
            ->orWhere('case_id', $trackingCode)
            ->first();

        if (!$report) {
            return response()->json(['success' => false, 'message' => 'No case found for this tracking code.'], 404);
        }

        if (in_array($report->status, ['CLOSED', 'SUCCESSFUL', 'DISPUTED'])) {
            return response()->json(['success' => false, 'message' => 'Evidence cannot be added to closed, successful or disputed cases.'], 422);
        }

        $validator = Validator::make($request->all(), [
            'files'   => ['required', 'array', 'min:1', 'max:10'],
            'files.*' => [
                'required',
                'file',
                'max:10240',
                'mimetypes:image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/quicktime,video/x-msvideo,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain',
            ],
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'message' => 'Validation error', 'errors' => $validator->errors()], 422);
        }

        try {
            $existingCount = $report->attachments()->count();
            $newFiles      = $request->file('files');

            if ($existingCount + count($newFiles) > 10) {
                return response()->json([
                    'success' => false,
                    'message' => "Maximum 10 files allowed. You already have {$existingCount} file(s) uploaded.",
                ], 422);
            }

            $uploaded = [];
            foreach ($newFiles as $file) {
                $stored = $file->store('evidence/' . $report->case_id, 'local');
                $attachment = $report->attachments()->create([
                    'original_name' => $file->getClientOriginalName(),
                    'file_name'     => $stored,
                    'mime_type'     => $file->getMimeType(),
                    'size'          => $file->getSize(),
                    'disk'          => 'local',
                    'created_by'    => null,
                ]);
                $uploaded[] = ['id' => $attachment->id, 'name' => $file->getClientOriginalName(), 'size' => $file->getSize(), 'mime_type' => $file->getMimeType()];
            }

            $this->auditService->record(
                action: 'EVIDENCE_UPLOADED',
                subject: $report,
                reportId: $report->id,
                userId: null,
                details: count($newFiles) . ' evidence file(s) uploaded via public portal.',
                metadata: ['case_id' => $report->case_id, 'count' => count($newFiles)],
            );

            return response()->json([
                'success' => true,
                'message' => count($uploaded) . ' file(s) uploaded successfully.',
                'data'    => ['uploaded' => $uploaded, 'total_attachments' => $existingCount + count($uploaded)],
            ]);
        } catch (\Throwable $e) {
            Log::error('Failed to upload evidence', ['error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Failed to upload evidence. Please try again.'], 500);
        }
    }

    /**
     * Download an evidence file using a tracking code (public, no auth).
     */
    public function downloadEvidence(string $trackingCode, string $attachmentId)
    {
        $report = Report::query()
            ->where('reference_code', $trackingCode)
            ->orWhere('case_id', $trackingCode)
            ->first();

        if (!$report) {
            return response()->json(['success' => false, 'message' => 'No case found for this tracking code.'], 404);
        }

        $attachment = $report->attachments()->find($attachmentId);

        if (!$attachment) {
            return response()->json(['success' => false, 'message' => 'Attachment not found.'], 404);
        }

        // Determine which storage disk and base path to use
        if ($attachment->disk === 'public') {
            $disk = Storage::disk('public');
            $basePath = 'app/public';
        } else {
            $disk = Storage::disk('local');
            $basePath = 'app/private';
        }

        $path = $attachment->file_name;

        if (!$disk->exists($path)) {
            return response()->json(['success' => false, 'message' => 'File not found on disk.'], 404);
        }

        return response()->download(
            storage_path($basePath . '/' . ltrim((string) $path, '/')),
            (string) $attachment->original_name
        );
    }

    public function publicStats(): JsonResponse
    {
        $total    = Report::count();
        $byStatus = Report::select('status', DB::raw('count(*) as cnt'))->groupBy('status')->pluck('cnt', 'status')->toArray();
        $byType   = Report::select('type',   DB::raw('count(*) as cnt'))->groupBy('type')  ->pluck('cnt', 'type')  ->toArray();

        $resolvedTotal      = ($byStatus['CLOSED'] ?? 0) + ($byStatus['SUCCESSFUL'] ?? 0);
        $resolvedLast30Days = Report::whereIn('status', ['CLOSED', 'SUCCESSFUL'])->where('updated_at', '>=', now()->subDays(30))->count();
        $successfulCount    = $byStatus['SUCCESSFUL'] ?? 0;
        $disputeCount       = $byStatus['DISPUTED'] ?? 0;
        $activeCount        = ($byStatus['SUBMITTED'] ?? 0) + ($byStatus['UNDER_REVIEW'] ?? 0) + ($byStatus['INVESTIGATING'] ?? 0) + ($byStatus['REFERRED'] ?? 0);
        $resolutionRate     = $total > 0 ? round(($resolvedTotal / $total) * 100) : 0;
        $disputeRate        = $total > 0 ? round(($disputeCount  / $total) * 100) : 0;

        return response()->json([
            'success' => true,
            'data'    => [
                'total_reports'           => $total,
                'active_investigations'   => $activeCount,
                'resolved_total'          => $resolvedTotal,
                'resolved_last_30_days'   => $resolvedLast30Days,
                'successful_total'        => $successfulCount,
                'resolution_rate'         => $resolutionRate,
                'dispute_rate'            => $disputeRate,
                'by_status'               => $byStatus,
                'by_type'                 => $byType,
            ],
        ]);
    }
}
