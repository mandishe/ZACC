<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\AIController;
use App\Http\Controllers\Api\PublicReportController;
use App\Http\Controllers\Api\CaseStageController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\ChatbotController;
use App\Http\Controllers\Api\ReportGenerationController;
use App\Http\Controllers\Api\HotspotController;

// ... other routes ...

// Public report routes
Route::middleware('throttle:public-reports')->group(function () {
    Route::post('/reports/anonymous', [PublicReportController::class, 'storeAnonymous']);
    Route::get('/reports/track/{trackingCode}', [PublicReportController::class, 'track'])->where('trackingCode', '[A-Za-z0-9-]+');
    Route::post('/reports/dispute/{trackingCode}', [PublicReportController::class, 'publicDispute'])->where('trackingCode', '[A-Za-z0-9-]+');
    Route::post('/reports/evidence/{trackingCode}', [PublicReportController::class, 'uploadEvidence'])->where('trackingCode', '[A-Za-z0-9-]+');
    Route::get('/reports/track/{trackingCode}/evidence/{attachmentId}', [PublicReportController::class, 'downloadEvidence'])
        ->where('trackingCode', '[A-Za-z0-9-]+')
        ->whereNumber('attachmentId');
    Route::get('/stats/public', [PublicReportController::class, 'publicStats']);
    Route::get('/hotspots/public', [HotspotController::class, 'publicHotspots']);
});

Route::post('/chatbot', [ChatbotController::class, 'chat'])->middleware('throttle:chatbot');

// Public auth routes
Route::middleware('throttle:auth')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/register', [AuthController::class, 'register']);
});

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/analytics/hotspots', [ReportController::class, 'hotspots']);
    Route::get('/track/{code}', [ReportController::class, 'track']);

    // Auth routes
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/user', [AuthController::class, 'user']);

    // Report routes
    Route::get('/reports', [ReportController::class, 'index']);
    Route::post('/reports', [ReportController::class, 'store']);
    Route::get('/reports/{id}', [ReportController::class, 'show'])->where('id', '[A-Za-z0-9-]+');
    Route::get('/reports/type-correction-audit', [ReportController::class, 'typeCorrectionAudit']);
    Route::get('/cases', [ReportController::class, 'index']); // Frontend alias
    Route::get('/reports/stats', [ReportController::class, 'stats']);

    // Report generation routes (must be before /reports/{id} wildcard)
    Route::get('/reports/generate/summary', [ReportGenerationController::class, 'summary']);
    Route::get('/reports/generate/export', [ReportGenerationController::class, 'export']);

    //Route::get('/reports/{id}', [ReportController::class, 'show'])->where('id', '[A-Za-z0-9-]+');
    Route::get('/reports/{id}/attachments/{attachmentId}/download', [ReportController::class, 'downloadAttachment'])
        ->where('id', '[A-Za-z0-9-]+')
        ->whereNumber('attachmentId');
    Route::put('/reports/{id}', [ReportController::class, 'update'])->where('id', '[A-Za-z0-9-]+');
    Route::put('/reports/{id}/status', [ReportController::class, 'updateStatus'])->where('id', '[A-Za-z0-9-]+');
    Route::post('/reports/{id}/dispute', [ReportController::class, 'dispute'])->where('id', '[A-Za-z0-9-]+');
    Route::get('/reports/{id}/verify', [ReportController::class, 'verify'])->where('id', '[A-Za-z0-9-]+');
    Route::post('/reports/{id}/stages', [CaseStageController::class, 'store'])->where('id', '[A-Za-z0-9-]+');
    Route::get('/reports/{id}/stages', [CaseStageController::class, 'index'])->where('id', '[A-Za-z0-9-]+');

    // Investigation Logs
    Route::get('/reports/{id}/logs', [\App\Http\Controllers\Api\InvestigationLogController::class, 'index'])->where('id', '[A-Za-z0-9-]+');
    Route::post('/reports/{id}/logs', [\App\Http\Controllers\Api\InvestigationLogController::class, 'store'])->where('id', '[A-Za-z0-9-]+');

    Route::get('/notifications', [CaseStageController::class, 'notifications']);
    Route::get('/audit/logs', [AuditController::class, 'index']);

    // Hotspot routes
    Route::get('/hotspots', [HotspotController::class, 'index']);

    // AI routes
    // Route::post('/ai/analyze-report', [AIController::class, 'analyzeReport']);
    // Route::get('/ai/expert-review/{id}', [AIController::class, 'expertCaseReview'])->where('id', '[A-Za-z0-9-]+');
    // Route::get('/ai/scan-evidence/{id}', [AIController::class, 'scanEvidence'])->where('id', '[A-Za-z0-9-]+');
    // Route::get('/ai/pre-review-analysis/{id}', [AIController::class, 'preReviewAnalysis'])->where('id', '[A-Za-z0-9-]+');
    // Route::post('/ai/pre-submission-suggestions', [AIController::class, 'preSubmissionSuggestions']);
    // Route::post('/ai/translate', [AIController::class, 'translateText']);

    // Admin: recalculate all report priorities using latest expert system
    Route::post('/reports/recalculate-priorities', [ReportController::class, 'recalculatePriorities']);

    // User management routes (admin only)
    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update'])->whereNumber('id');
    Route::delete('/users/{id}', [UserController::class, 'destroy'])->whereNumber('id');
    Route::post('/users/{id}/reset-password', [UserController::class, 'resetPassword'])->whereNumber('id');
    Route::post('/users/{id}/toggle-active', [UserController::class, 'toggleActive'])->whereNumber('id');
});
