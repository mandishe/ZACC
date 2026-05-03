<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Report;
use App\Models\ReportAttachment;
use App\Services\ExpertEvaluationService;
use Illuminate\Support\Facades\Crypt; // Required for backend encryption
use Illuminate\Support\Facades\DB;
use Illuminate\Http\JsonResponse;

class PublicReportController extends Controller
{
    protected ExpertEvaluationService $aiService;

    public function __construct(ExpertEvaluationService $aiService)
    {
        $this->aiService = $aiService;
    }

    /**
     * Get public statistics for the dashboard.
     */
    public function publicStats(): JsonResponse
    {
        $byStatus = Report::select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->get()
            ->pluck('total', 'status')
            ->toArray();

        // Active investigations are SUBMITTED, UNDER_REVIEW, INVESTIGATING
        $activeInvestigations = ($byStatus['SUBMITTED'] ?? 0) +
            ($byStatus['UNDER_REVIEW'] ?? 0) +
            ($byStatus['INVESTIGATING'] ?? 0);

        return response()->json([
            'success' => true,
            'data' => [
                'by_status' => $byStatus,
                'resolved_total' => $byStatus['CLOSED'] ?? 0,
                'active_investigations' => $activeInvestigations,
                'total_reports' => Report::count(),
            ],
        ]);
    }

    public function storeAnonymous(Request $request)
    {
        // 1. Validate the incoming RAW text and files
        $validated = $request->validate([
            'description' => 'required|string',
            'institution' => 'required|string',
            'province'    => 'nullable|string',
            'location'    => 'nullable|string',
            'evidence'    => 'nullable|array|max:10',
            'evidence.*'  => 'file|mimes:pdf,jpg,jpeg,png|max:10240',
        ]);

        $evidenceFiles = $request->file('evidence', []);

        // 2. AI reads the RAW description and RAW files
        $aiAnalysis = $this->aiService->evaluateReport(
            $validated['description'],
            is_array($evidenceFiles) ? $evidenceFiles : [$evidenceFiles]
        );

        // 3. Prepare the report instance
        $report = new Report([
            'case_id' => Report::generateCaseId(),
            'reference_code' => 'ZACC-REF-' . strtoupper(substr(uniqid(), -4)),
            'institution' => $validated['institution'],
            'type' => $aiAnalysis['type_inference']['inferred_type'] ?? 'Unclassified',
            'risk_score' => $aiAnalysis['risk_score'] ?? 0,
            'ai_summary' => [
                'type_inference' => $aiAnalysis['type_inference'] ?? ['inferred_type' => 'Unclassified', 'confidence' => 0],
                'summary_text' => $aiAnalysis['summary'] ?? 'Manual review required.'
            ],
            'status' => 'SUBMITTED',
            'province' => $validated['province'] ?? null,
            'location' => $validated['location'] ?? null,
        ]);

        // 4. Encrypt sensitive data using the model's secure method
        $report->setEncryptedData([
            'description' => $validated['description'],
            'location' => $validated['location'] ?? null,
            'institution' => $validated['institution'],
        ]);

        $report->save();

        // 5. Save the physical files and link them in the database
        if (!empty($evidenceFiles)) {
            $files = is_array($evidenceFiles) ? $evidenceFiles : [$evidenceFiles];
            foreach ($files as $file) {
                // Stores in storage/app/public/evidence
                $path = $file->store('evidence', 'public');

                ReportAttachment::create([
                    'report_id' => $report->id,
                    'original_name' => $file->getClientOriginalName(),
                    'file_name' => $path, // This maps to the internal storage path required by the DB
                    'file_path' => $path, // Keeping this for model compatibility if needed
                    'mime_type' => $file->getMimeType(),
                    'size' => $file->getSize(), // Correct column name is 'size', not 'file_size'
                ]);
            }
        }

        // Return the report with the attachments loaded so the UI updates instantly
        return response()->json([
            'success' => true,
            'message' => 'Report submitted successfully',
            'data' => $report->load('attachments')
        ], 201);
    }
}
