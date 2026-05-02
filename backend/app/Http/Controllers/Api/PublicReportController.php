<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Report;
use App\Models\ReportAttachment;
use App\Services\ExpertEvaluationService;
use Illuminate\Support\Facades\Crypt; // Required for backend encryption

class PublicReportController extends Controller
{
    protected ExpertEvaluationService $aiService;

    public function __construct(ExpertEvaluationService $aiService)
    {
        $this->aiService = $aiService;
    }

    public function storeAnonymous(Request $request)
    {
        // 1. Validate the incoming RAW text and files
        $validated = $request->validate([
            'description' => 'required|string',
            'province'    => 'nullable|string',
            'location'    => 'nullable|string',
            'evidence'    => 'nullable|array|max:10',
            'evidence.*'  => 'file|mimes:pdf,jpg,jpeg,png|max:10240',
        ]);

        $evidenceFiles = $request->file('evidence', []);

        // 2. AI reads the RAW description and RAW files
        $aiAnalysis = $this->aiService->evaluateReport(
            $validated['description'],
            $evidenceFiles
        );

        // 3. Encrypt the description BEFORE saving it to the database
        // Note: If your Report.php model already uses `$casts = ['description' => 'encrypted']`, 
        // you can remove the Crypt::encryptString wrapper and just pass $validated['description'].
        $secureDescription = Crypt::encryptString($validated['description']);

        // 4. Save the report securely
        $report = Report::create([
            'reference_code' => 'ZACC-REF-' . strtoupper(substr(uniqid(), -4)),
            'description' => $secureDescription, // Now it is secure at rest!
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

        // 5. Save the physical files and link them in the database
        if (!empty($evidenceFiles)) {
            foreach ($evidenceFiles as $file) {
                // Stores in storage/app/public/evidence
                $path = $file->store('evidence', 'public');

                ReportAttachment::create([
                    'report_id' => $report->id,
                    'file_name' => $file->getClientOriginalName(),
                    'file_path' => $path,
                    'mime_type' => $file->getMimeType(),
                    'file_size' => $file->getSize(),
                ]);
            }
        }

        // Return the report with the attachments loaded so the UI updates instantly
        return response()->json($report->load('attachments'), 201);
    }
}