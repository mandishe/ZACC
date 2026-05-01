<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ReportController extends Controller
{
    public function store(Request $request)
    {
        // 1. Validate the incoming data from the React frontend
        $request->validate([
            'description' => 'nullable|string',
            'files' => 'nullable|array',
            'files.*' => 'file|max:51200', // Max 50MB per file
        ]);

        // 2. Generate a unique tracking code (e.g., ZACC-REF-8A2F)
        $trackingCode = 'ZACC-REF-' . strtoupper(Str::random(6));

        // 3. Create a secure folder for this specific report
        // We use 'private' so it cannot be accessed via a public web URL
        $storagePath = 'private/reports/' . $trackingCode;
        $savedFiles = [];

        // 4. Catch and save the files
        if ($request->hasFile('files')) {
            foreach ($request->file('files') as $file) {
                // Store the file securely and keep a record of its path
                $path = $file->store($storagePath);
                $savedFiles[] = [
                    'original_name' => $file->getClientOriginalName(),
                    'path' => $path,
                    'mime_type' => $file->getMimeType()
                ];
            }
        }

        /* 
         * TODO: PHASE 3 - AI INTEGRATION GOES HERE
         * We will pass the $request->description and the $savedFiles 
         * to Gemini to get our category and severity score.
         */

        // 5. Return success to the React frontend
        return response()->json([
            'message' => 'Report securely logged.',
            'tracking_code' => $trackingCode,
            'file_count' => count($savedFiles),
            'status' => 'SUBMITTED'
        ], 201);
    }
}