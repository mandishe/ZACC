<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ExpertEvaluationService
{
    /**
     * Sends the report description to Gemini to get dynamic categorization and scoring.
     */
    public function evaluateReport(string $description, array $evidenceFiles = []): array
    {
        $apiKey = env('GEMINI_API_KEY');
        $model = config('services.gemini.model', 'gemini-2.0-flash');

        if (!$apiKey) {
            Log::error('CRITICAL: Gemini API key is missing from the .env file.');
            return $this->fallbackResponse('API Key Missing');
        }

        // The Prompt: We are forcing Gemini to act as an investigator and return STRICT JSON.
        $prompt = "You are an expert intelligence analyst for the Zimbabwe Anti-Corruption Commission.
        Analyze the following whistleblower report and any attached evidence (images/PDFs) provided as inline data.

        If evidence is provided, cross-reference it with the description to verify the claims.
        If no evidence is provided, base your analysis solely on the text.

        Respond STRICTLY in JSON format matching this exact structure. Do not include markdown formatting or backticks:
        {
            \"type_inference\": {
                \"inferred_type\": \"Categorize into one: Bribery, Embezzlement, Fraud, Nepotism, Abuse of Office, or Other\",
                \"confidence\": <number between 1 and 100 representing your certainty based on the detail and evidence provided>
            },
            \"risk_score\": <number between 1 and 100 where 100 is critical, immediate danger or massive financial loss>,
            \"summary\": \"Write a highly concise, professional 2-sentence summary of the incident and what the evidence (if any) proves.\"
        }

        Report Text to Analyze: " . $description;

        // Prepare multimodal parts
        $parts = [
            ['text' => $prompt]
        ];

        foreach ($evidenceFiles as $file) {
            try {
                $parts[] = [
                    'inlineData' => [
                        'mimeType' => $file->getMimeType(),
                        'data' => base64_encode(file_get_contents($file->getRealPath()))
                    ]
                ];
            } catch (\Exception $e) {
                Log::warning('Failed to process file for Gemini: ' . $file->getClientOriginalName());
            }
        }

        try {
            // Make the HTTP POST request to the Gemini API
            $response = Http::withHeaders([
                'Content-Type' => 'application/json'
            ])->post('https://generativelanguage.googleapis.com/v1beta/models/' . $model . ':generateContent?key=' . $apiKey, [
                'contents' => [
                    [
                        'parts' => $parts
                    ]
                ],
                'generationConfig' => [
                    'response_mime_type' => 'application/json',
                    'temperature' => 0.1,
                ],
                'safetySettings' => [
                    [
                        'category' => 'HARM_CATEGORY_HARASSMENT',
                        'threshold' => 'BLOCK_NONE'
                    ],
                    [
                        'category' => 'HARM_CATEGORY_HATE_SPEECH',
                        'threshold' => 'BLOCK_NONE'
                    ],
                    [
                        'category' => 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                        'threshold' => 'BLOCK_NONE'
                    ],
                    [
                        'category' => 'HARM_CATEGORY_DANGEROUS_CONTENT',
                        'threshold' => 'BLOCK_NONE'
                    ]
                ]
            ]);

            if ($response->successful()) {
                $result = $response->json();

                // Check if the response was blocked by safety filters
                if (isset($result['candidates'][0]['finishReason']) && $result['candidates'][0]['finishReason'] === 'SAFETY') {
                    Log::warning('Gemini response blocked by safety filters despite BLOCK_NONE.');
                    return $this->fallbackResponse('Safety Blocked');
                }

                // Extract the text from Gemini's response
                $textResponse = $result['candidates'][0]['content']['parts'][0]['text'] ?? '';

                // Safety cleanup: Sometimes Gemini wraps JSON in ```json ... ``` despite instructions.
                $cleanJson = str_replace(['```json', '```', "\n"], '', trim($textResponse));

                $decodedData = json_decode($cleanJson, true);

                // If decoding was successful, return the real AI data!
                if (json_last_error() === JSON_ERROR_NONE && isset($decodedData['risk_score'])) {
                    return $decodedData;
                }

                Log::error('Gemini returned invalid JSON: ' . $textResponse);
            } else {
                Log::error('Gemini API Request Failed: ' . $response->body());
            }

        } catch (\Exception $e) {
            Log::error('Gemini API Connection Error: ' . $e->getMessage());
        }

        // If anything fails, return a safe fallback so the app doesn't crash
        return $this->fallbackResponse('AI Analysis Unavailable');
    }

    /**
     * Fallback data in case the AI goes offline or errors out.
     */
    private function fallbackResponse(string $reason): array
    {
        return [
            'type_inference' => [
                'inferred_type' => 'Unclassified',
                'confidence' => 0
            ],
            'risk_score' => 0,
            'summary' => $reason . '. Manual review required.'
        ];
    }
}
