<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Gemini\Client;

class ReportController extends Controller
{
    public function store(Request $request)
    {
        // 1. Validate
        $request->validate([
            'description' => 'nullable|string',
            'files' => 'nullable|array|max:10',
            'files.*' => 'file|max:51200|mimes:jpg,jpeg,png,pdf,docx,mp4',
        ]);

        DB::beginTransaction();

        try {
            $trackingCode = 'ZACC-REF-' . strtoupper(Str::random(6));
            $storagePath = 'private/reports/' . $trackingCode;
            $savedFiles = [];

            // 2. Save files
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

            // 3. Prepare AI input
            $evidenceString = "User Description: " . ($request->description ?? 'None provided.') . "\n\n";
            $imageParts = [];

            foreach ($savedFiles as $fileInfo) {
                if (str_starts_with($fileInfo['mime_type'], 'image/')) {
                    $imageParts[] = [
                        'mimeType' => $fileInfo['mime_type'],
                        'data' => base64_encode(file_get_contents($fileInfo['absolute_path']))
                    ];
                } elseif ($fileInfo['mime_type'] === 'application/pdf') {
                    if (class_exists(\Spatie\PdfToText\Pdf::class)) {
                        try {
                            $text = \Spatie\PdfToText\Pdf::getText($fileInfo['absolute_path']);
                            $evidenceString .= "PDF ({$fileInfo['original_name']}):\n{$text}\n\n";
                        } catch (\Exception $e) {
                            Log::error("PDF extraction failed: " . $e->getMessage());
                        }
                    }
                }
            }

            // 4. Prompt
            $prompt = "
You are an expert investigator for ZACC.

Analyze the following evidence:

{$evidenceString}

Respond ONLY with valid JSON:
{
  \"category\": \"String\",
  \"image_analysis\": \"String\",
  \"summary\": \"String\",
  \"severity_score\": Integer
}
";

            // 5. Call Gemini (CORRECT SDK USAGE)
            try {
                $client = new Client(env('GEMINI_API_KEY'));

                if (count($imageParts) > 0) {
                    // Multimodal request
                   $parts = [
    [
        'text' => $prompt
    ]
];

foreach ($imageParts as $img) {
    $parts[] = [
        'inlineData' => [
            'mimeType' => $img['mimeType'],
            'data' => $img['data']
        ]
    ];
}

                    $model = count($imageParts) > 0
                    ? 'gemini-1.5-flash'   // supports images
                    : 'gemini-1.5-flash';  // also fine for text

                $response = $client
                    ->generativeModel($model)
                    ->generateContent($parts);
                } else {
                    // Text-only
                    $response = $client->geminiPro()->generateContent($prompt);
                }

                $aiText = $response->text() ?? '';

                // Clean response
                $clean = trim(str_replace(['```json', '```'], '', $aiText));
                $aiAnalysis = json_decode($clean, true);

                if (!is_array($aiAnalysis)) {
                    throw new \Exception("Invalid AI JSON: " . $clean);
                }

            } catch (\Exception $e) {
                Log::error("AI failed: " . $e->getMessage());

                $aiAnalysis = [
                    'category' => 'Uncategorized',
                    'image_analysis' => 'AI failed',
                    'summary' => 'Manual review required',
                    'severity_score' => 0
                ];
            }

            // 6. Save Report
            $report = \App\Models\Report::create([
                'tracking_code' => $trackingCode,
                'description' => $request->description,
                'category' => $aiAnalysis['category'] ?? 'Uncategorized',
                'ai_summary' => "Images: " . ($aiAnalysis['image_analysis'] ?? '') .
                    "\n\nText: " . ($aiAnalysis['summary'] ?? ''),
                'severity_score' => $aiAnalysis['severity_score'] ?? 0,
                'status' => 'SUBMITTED'
            ]);

            // 7. Save attachments
            foreach ($savedFiles as $fileInfo) {
                \App\Models\ReportAttachment::create([
                    'report_id' => $report->id,
                    'file_name' => $fileInfo['original_name'],
                    'file_path' => $fileInfo['path'],
                    'mime_type' => $fileInfo['mime_type']
                ]);
            }

            DB::commit();

            // 8. Response
            return response()->json([
                'message' => 'Report securely logged and analyzed.',
                'tracking_code' => $trackingCode,
                'file_count' => count($savedFiles),
                'status' => 'SUBMITTED',
                'severity_score' => $aiAnalysis['severity_score'] ?? 0
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