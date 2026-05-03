<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\InvestigationLog;
use App\Models\Report;
use Illuminate\Support\Facades\Auth;

class InvestigationLogController extends Controller
{
    /**
     * Get all investigation logs for a report.
     */
    public function index($reportId)
    {
        $logs = InvestigationLog::with('user:id,name,role')
            ->where('report_id', $reportId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($logs);
    }

    /**
     * Store a new investigation log.
     */
    public function store(Request $request, $reportId)
    {
        $validated = $request->validate([
            'note' => 'required|string',
            'metadata' => 'nullable|array'
        ]);

        $log = InvestigationLog::create([
            'report_id' => $reportId,
            'user_id' => Auth::id(),
            'note' => $validated['note'],
            'metadata' => $validated['metadata'] ?? null
        ]);

        return response()->json($log->load('user:id,name,role'), 201);
    }
}
