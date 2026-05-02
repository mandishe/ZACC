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

        if (!$apiKey) {
            Log::error('CRITICAL: Gemini API key is missing from the .env file.');
            return $this->fallbackResponse('API Key Missing');
        }

        // The Prompt: We are forcing Gemini to act as an investigator and return STRICT JSON.
        $prompt = "You are an expert intelligence analyst for the Zimbabwe Anti-Corruption Commission. 
        Analyze the following whistleblower report. 
        
        Respond STRICTLY in JSON format matching this exact structure. Do not include markdown formatting or backticks:
        {
            \"type_inference\": {
                \"inferred_type\": \"Categorize into one: Bribery, Embezzlement, Fraud, Nepotism, Abuse of Office, or Other\",
                \"confidence\": <number between 1 and 100>
            },
            \"risk_score\": <number between 1 and 100 where 100 is critical, immediate danger or massive financial loss>,
            \"summary\": \"Write a highly concise, professional 2-sentence summary of the incident.\"
        }
        
        Report Text to Analyze: " . $description;

        try {
            // Make the HTTP POST request to the Gemini API
            $response = Http::withHeaders([
                'Content-Type' => 'application/json'
            ])->post('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' . $apiKey, [
                'contents' => [
                    [
                        'parts' => [
                            ['text' => $prompt]
                        ]
                    ]
                ]
            ]);

            if ($response->successful()) {
                $result = $response->json();
                
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