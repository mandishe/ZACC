<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Auth;
use Carbon\Carbon;

class Report extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'case_id',
        'reference_code',
        'user_id',
        'assigned_to',
        'type',
        'institution',
        'location',
        'description',
        'status',
        'priority',
        'risk_score',
        'dispute_reason',
        'closed_at_stage',
        'last_updated',
        'encrypted_data',
        'blockchain_tx_hash',
        'blockchain_block_number',
        'ai_summary',
        'ip_address',
        'user_agent',
        'is_anonymous',
        'is_encrypted',
        'report_language',
        'text_clarity_score',
    ];

    /**
     * Submit report to blockchain
     */
    public function submitToBlockchain(): bool
    {
        try {
            $blockchain = app(\App\Services\BlockchainService::class);

            // Collect data to hash - using stable fields
            $dataToHash = json_encode([
                'case_id' => $this->case_id,
                'reference_code' => $this->reference_code,
                'type' => $this->type,
                'institution' => $this->institution,
                'created_at' => $this->created_at->toIso8601String(),
                'is_anonymous' => $this->is_anonymous
            ]);

            $dataHash = hash('sha256', $dataToHash);
            $blockNumber = $blockchain->submitReport($this->case_id, $dataHash);

            if ($blockNumber) {
                $this->blockchain_tx_hash = '0x' . $dataHash; // Simulated TX hash
                $this->blockchain_block_number = $blockNumber;
                return $this->save();
            }

            return false;
        } catch (\Exception $e) {
            Log::error('Blockchain submission failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Verify the report on the blockchain
     */
    public function verifyOnBlockchain(): bool
    {
        if (!$this->blockchain_tx_hash) {
            return false;
        }

        try {
            $blockchain = app(\App\Services\BlockchainService::class);

            // Recalculate hash to verify
            $dataToHash = json_encode([
                'case_id' => $this->case_id,
                'reference_code' => $this->reference_code,
                'type' => $this->type,
                'institution' => $this->institution,
                'created_at' => $this->created_at->toIso8601String(),
                'is_anonymous' => $this->is_anonymous
            ]);

            $dataHash = hash('sha256', $dataToHash);
            return $blockchain->verifyReport($this->case_id, $dataHash);
        } catch (\Exception $e) {
            Log::error('Blockchain verification failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'last_updated' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'is_anonymous' => 'boolean',
        'is_encrypted' => 'boolean',
        'risk_score' => 'integer',
        'text_clarity_score' => 'integer',
        'ai_summary' => 'array',
    ];

    protected $appends = ['is_owner', 'can_view', 'can_edit', 'decrypted_data', 'file_count'];

    protected $hidden = [
        'user_id',
        'ip_address',
        'user_agent',
        'encrypted_data',
    ];

    /**
     * Get the count of attachments.
     */
    public function getFileCountAttribute(): int
    {
        return $this->attachments()->count();
    }

    /**
     * Get the user that owns the report.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get report attachments.
     */
    public function attachments(): HasMany
    {
        return $this->hasMany(ReportAttachment::class);
    }

    /**
     * Get activity logs for this report.
     */
    public function activityLogs(): MorphMany
    {
        return $this->morphMany(ActivityLog::class, 'subject');
    }

    /**
     * Get per-stage investigator evaluations.
     */
    public function stageEvaluations(): HasMany
    {
        return $this->hasMany(ReportStageEvaluation::class);
    }

    /**
     * Get stakeholder notifications related to the report.
     */
    public function stakeholderNotifications(): HasMany
    {
        return $this->hasMany(StakeholderNotification::class);
    }

    /**
     * Get the decrypted report data.
     * Uses AES-256-CBC (Laravel Crypt) — role-based access control decides visibility.
     */
    public function getDecryptedDataAttribute()
    {
        if (!$this->is_encrypted || !$this->encrypted_data) {
            return [
                'description' => $this->description,
                'location' => $this->location,
                'institution' => $this->institution,
            ];
        }

        try {
            /** @var User|null $user */
            $user = Auth::user();

            if (!$user) {
                return [
                    'description' => '🔒 Encrypted content - Authentication required',
                    'location' => '🔒',
                    'institution' => '🔒',
                ];
            }

            // Only admins, the report owner, or investigators may decrypt
            $canDecrypt = $user->isAdmin()
                || $user->id === $this->user_id
                || $user->isInvestigator();

            if (!$canDecrypt) {
                return [
                    'description' => '🔒 Encrypted content - Unauthorized access',
                    'location' => '🔒',
                    'institution' => '🔒',
                ];
            }

            $decrypted = Crypt::decryptString($this->encrypted_data);
            return json_decode($decrypted, true) ?? [];
        } catch (\Exception $e) {
            Log::error('Decryption failed: ' . $e->getMessage());
            return [
                'description' => '🔒 Error decrypting content',
                'location' => '🔒',
                'institution' => '🔒',
            ];
        }
    }

    /**
     * Set the encrypted data using AES-256-CBC (Laravel Crypt).
     * This avoids RSA payload size limits and ensures all descriptions
     * are encrypted at rest regardless of length.
     */
    public function setEncryptedData($data, $publicKey = null)
    {
        $jsonData = json_encode([
            'description' => $data['description'] ?? '',
            'location' => $data['location'] ?? null,
            'institution' => $data['institution'] ?? null,
        ]);

        try {
            $this->encrypted_data = Crypt::encryptString($jsonData);
            $this->is_encrypted = true;
            $this->description = '🔒 Encrypted content';
        } catch (\Exception $e) {
            Log::error('AES encryption failed; storing report unencrypted.', [
                'error' => $e->getMessage(),
            ]);
            $this->is_encrypted = false;
            $this->description = $data['description'] ?? '';
            $this->encrypted_data = null;
        }
    }

    /**
     * Scope a query to only include reports visible to the current user
     */
    public function scopeVisibleTo($query, User $user)
    {
        if ($user->isAdmin()) {
            return $query;
        }

        if ($user->isInvestigator()) {
            return $query->whereIn('status', ['SUBMITTED', 'UNDER_REVIEW', 'INVESTIGATING']);
        }

        // Regular users can only see their own reports
        return $query->where('user_id', $user->id);
    }

    /**
     * Check if the current user is the owner of the report
     */
    public function getIsOwnerAttribute(): bool
    {
        return Auth::check() && $this->user_id === Auth::id();
    }

    /**
     * Check if the current user can view the report
     */
    public function getCanViewAttribute(): bool
    {
        if (!Auth::check()) {
            return false;
        }

        /** @var User|null $user */
        $user = Auth::user();

        if (!$user) {
            return false;
        }

        if ($user->isAdmin()) {
            return true;
        }

        if ($user->isInvestigator()) {
            return in_array($this->status, ['SUBMITTED', 'UNDER_REVIEW', 'INVESTIGATING']);
        }

        return $this->user_id === $user->id;
    }

    /**
     * Check if the current user can edit the report
     */
    public function getCanEditAttribute(): bool
    {
        if (!Auth::check()) {
            return false;
        }

        /** @var User|null $user */
        $user = Auth::user();

        if (!$user) {
            return false;
        }

        if ($user->isAdmin()) {
            return true;
        }

        // Only allow editing if the report is in draft or submitted state
        // and the user is the owner or an investigator
        return ($this->user_id === $user->id || $user->isInvestigator())
            && in_array($this->status, ['DRAFT', 'SUBMITTED']);
    }

    /**
     * Generate a unique case ID.
     */
    public static function generateCaseId(): string
    {
        do {
            $caseId = 'ZACC-' . rand(1000, 9999);
        } while (self::where('case_id', $caseId)->exists());

        return $caseId;
    }

    /**
     * Generate a unique reference code.
     */
    public static function generateReferenceCode(): string
    {
        do {
            $referenceCode = 'ZACC-REF-' . rand(100, 999);
        } while (self::where('reference_code', $referenceCode)->exists());

        return $referenceCode;
    }

    /**
     * Scope a query to only include reports with a specific status.
     */
    public function scopeStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Scope a query to only include reports with a specific priority.
     */
    public function scopePriority($query, string $priority)
    {
        return $query->where('priority', $priority);
    }

    /**
     * Scope a query to only include disputed reports.
     */
    public function scopeDisputed($query)
    {
        return $query->where('status', 'DISPUTED');
    }
}
