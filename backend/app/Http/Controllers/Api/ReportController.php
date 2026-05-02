<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use App\Models\Report;
use App\Models\ReportAttachment;
use App\Services\ExpertEvaluationService;

class ReportController extends Controller
{
    protected ExpertEvaluationService $aiService;

    public function __construct(ExpertEvaluationService $aiService)
    {
        $this->aiService = $aiService;
    }

    // =========================
    // GET ALL REPORTS
    // =========================
    public function index()
    {
        $reports = Report::orderBy('created_at', 'desc')->get();
        return response()->json($reports, 200);
    }

    // =========================
    // GET SINGLE REPORT
    // =========================
    public function show(string $id)
    {
        $report = Report::findOrFail($id);
        return response()->json($report, 200);
    }

    // =========================
    // TRACK BY CODE
    // =========================
    public function track(string $code)
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
        'description' => 'required|string',
        'province'    => 'nullable|string',
        'location'    => 'nullable|string',
        'evidence'    => 'nullable|array|max:10',
        'evidence.*'  => 'file|mimes:pdf,jpg,jpeg,png|max:10240', // 10MB per file
    ]);

    DB::beginTransaction();

    try {
        // =========================
        // GENERATE TRACKING CODE
        // =========================
        $trackingCode = 'ZACC-REF-' . strtoupper(Str::random(6));
        $storagePath = 'private/reports/' . $trackingCode;

        // =========================
        // GET FILES FROM REQUEST
        // =========================
        $evidenceFiles = $request->file('evidence', []);
        $savedFiles = [];

        // =========================
        // SAVE FILES LOCALLY
        // =========================
        foreach ($evidenceFiles as $file) {
            $path = $file->store($storagePath);

            $savedFiles[] = [
                'original_name' => $file->getClientOriginalName(),
                'path' => $path,
                'mime_type' => $file->getMimeType(),
                'absolute_path' => Storage::path($path),
                'file_object' => $file // 👈 IMPORTANT: pass to AI
            ];
        }

        // =========================
        // AI ANALYSIS (NOW WITH FILES)
        // =========================
        $aiAnalysis = $this->aiService->evaluateReport(
            $validated['description'],
            $evidenceFiles
        );

        // =========================
        // SAVE REPORT
        // =========================
        $report = Report::create([
            'tracking_code' => $trackingCode,
            'reference_code' => $trackingCode,

            'description' => $validated['description'],
            'province' => $validated['province'] ?? null,
            'location' => $validated['location'] ?? null,

            // ✅ Safe AI mapping
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
                'file_name' => $fileInfo['original_name'],
                'file_path' => $fileInfo['path'],
                'mime_type' => $fileInfo['mime_type']
            ]);
        }

        DB::commit();

        // =========================
        // RESPONSE
        // =========================
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
            'message' => 'Failed to submit report.',
        ], 500);
    }
}
}