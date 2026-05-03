<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use App\Models\Report;
use App\Models\ReportAttachment;
use App\Services\ExpertEvaluationService; // ✅ NEW SERVICE

class ReportController extends Controller
{
    protected $aiService;

    public function __construct(ExpertEvaluationService $aiService)
    {
        $this->aiService = $aiService;
    }

    // =========================
    // GET ALL REPORTS
    // =========================
    public function index()
    {
        $reports = Report::visibleTo(Auth::user())
            ->orderBy('created_at', 'desc')
            ->get();
        return response()->json($reports, 200);
    }

    // =========================
    // GET SINGLE REPORT
    // =========================
    public function show($id)
    {
        $report = Report::with('attachments')->findOrFail($id);

        // Decrypt description if encrypted
        if ($report->is_encrypted && $report->encrypted_data) {
            $report->description = $report->decrypted_data['description'] ?? $report->description;
        }

        return response()->json($report, 200);
    }

    /**
     * Securely download a report attachment.
     */
    public function downloadAttachment($id, $attachmentId)
    {
        $report = Report::findOrFail($id);
        $attachment = $report->attachments()->findOrFail($attachmentId);

        if (!Storage::disk($attachment->disk)->exists($attachment->file_name)) {
            return response()->json(['message' => 'File not found.'], 404);
        }

        return Storage::disk($attachment->disk)->download(
            $attachment->file_name,
            $attachment->original_name
        );
    }

    /**
     * Update report status and handle referral.
     */
    public function updateStatus(Request $request, $id)
    {
        $report = Report::findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|string|in:SUBMITTED,UNDER_REVIEW,INVESTIGATING,REFERRED,CLOSED,DISPUTED',
            'referred_to_authority' => 'nullable|string|required_if:status,REFERRED'
        ]);

        $updateData = ['status' => $validated['status']];

        if ($validated['status'] === 'REFERRED') {
            $updateData['referred_to_authority'] = $validated['referred_to_authority'];
            $updateData['referral_date'] = now();
        }

        $report->update($updateData);

        return response()->json([
            'message' => 'Status updated successfully.',
            'status' => $report->status,
            'referred_to_authority' => $report->referred_to_authority
        ]);
    }

    // =========================
    // TRACK BY CODE
    // =========================
    public function track($code)
    {
        $report = Report::where('reference_code', $code)->first();

        if (!$report) {
            return response()->json([
                'message' => 'Invalid tracking code or case not found.'
            ], 404);
        }

        return response()->json([
            'reference_code' => $report->reference_code,
            'status' => $report->status,
            'created_at' => $report->created_at->toIso8601String(),
        ], 200);
    }

    // =========================
    // HOTSPOTS ANALYSIS
    // =========================
    public function hotspots()
    {
        $hotspots = Report::selectRaw('type as category, count(*) as count, avg(risk_score) as avgSeverity')
            ->whereNotNull('type')
            ->groupBy('type')
            ->get();

        return response()->json(
            $hotspots->map(fn($item) => [
                'category' => $item->category,
                'count' => (int) $item->count,
                'avgSeverity' => round((float) $item->avgSeverity, 1)
            ]),
            200
        );
    }

    // =========================
    // STORE REPORT (UPDATED)
    // =========================
    public function store(Request $request)
    {
        $validated = $request->validate([
            'description' => 'nullable|string',
            'files' => 'nullable|array|max:10',
            'files.*' => 'file|max:51200|mimes:jpg,jpeg,png,pdf,docx,mp4',
        ]);

        DB::beginTransaction();

        try {
            $trackingCode = 'ZACC-REF-' . strtoupper(Str::random(6));
            $storagePath = 'private/reports/' . $trackingCode;
            $savedFiles = [];

            // =========================
            // SAVE FILES
            // =========================
            if ($request->hasFile('files')) {
                foreach ($request->file('files') as $file) {
                    $path = $file->store($storagePath);

                    $savedFiles[] = [
                        'original_name' => $file->getClientOriginalName(),
                        'path' => $path,
                        'mime_type' => $file->getMimeType(),
                        'absolute_path' => Storage::path($path)
                    ];
                }
            }

            // =========================
            // AI ANALYSIS VIA SERVICE
            // =========================
            $aiAnalysis = $this->aiService->evaluateReport(
                $validated['description'] ?? ''
            );

            // =========================
            // SAVE REPORT
            // =========================
            $report = Report::create([
                'tracking_code' => $trackingCode, // internal
                'reference_code' => $trackingCode, // external tracking
                'description' => $validated['description'] ?? null,

                // ✅ Map AI response safely
                'type' => $aiAnalysis['type_inference']['inferred_type'] ?? 'Uncategorized',
                'risk_score' => $aiAnalysis['risk_score'] ?? 0,

                'ai_summary' => json_encode([
                    'type_inference' => $aiAnalysis['type_inference'] ?? null,
                    'summary_text' => $aiAnalysis['summary'] ?? null
                ]),

                'status' => 'SUBMITTED'
            ]);

            // =========================
            // SAVE ATTACHMENTS
            // =========================
            foreach ($savedFiles as $fileInfo) {
                ReportAttachment::create([
                    'report_id' => $report->id,
                    'original_name' => $fileInfo['original_name'],
                    'file_name' => $fileInfo['path'],
                    'mime_type' => $fileInfo['mime_type'],
                    'size' => Storage::size($fileInfo['path']),
                    'disk' => 'private'
                ]);
            }

            DB::commit();

            return response()->json([
                'message' => 'Report securely logged and analyzed.',
                'tracking_code' => $trackingCode,
                'file_count' => count($savedFiles),
                'status' => 'SUBMITTED',
                'severity_score' => $aiAnalysis['risk_score'] ?? 0
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();

            Log::error("Report submission failed: " . $e->getMessage());

            return response()->json([
                'message' => 'Failed to submit report.'
            ], 500);
        }
    }
}
