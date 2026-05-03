<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const ROLE_WHISTLEBLOWER = 'WHISTLEBLOWER';
    public const ROLE_INVESTIGATOR = 'INVESTIGATOR';
    public const ROLE_ADMIN = 'ADMIN';
    public const ROLE_EXTERNAL_AUTHORITY = 'EXTERNAL_AUTHORITY';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'institution',
        'is_active',
        'allowed_case_types',
        'public_key',
        'private_key_encrypted',
        'password_reset_token',
        'password_reset_token_expires_at',
    ];

    protected $appends = ['role_name'];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'private_key_encrypted' => 'encrypted',
        'is_active' => 'boolean',
        'allowed_case_types' => 'array',
        'password_reset_token_expires_at' => 'datetime',
    ];

    /**
     * Get the reports for the user.
     */
    public function reports()
    {
        return $this->hasMany(Report::class);
    }

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'private_key_encrypted',
        'public_key',
        'password_reset_token',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($user) {
            // Allow seeding / imports to provide keys explicitly.
            if (!empty($user->public_key) || !empty($user->private_key_encrypted)) {
                return;
            }

            // Generate a new key pair for the user
            $config = [
                'digest_alg' => 'sha512',
                // 2048 is widely supported and fast; increase only if needed.
                'private_key_bits' => 2048,
                'private_key_type' => OPENSSL_KEYTYPE_RSA,
            ];

            // Create the private and public key
            $res = @openssl_pkey_new($config);

            if ($res === false) {
                $errors = [];
                while ($msg = openssl_error_string()) {
                    $errors[] = $msg;
                }

                Log::warning('OpenSSL keypair generation failed; creating user without encryption keys.', [
                    'email' => $user->email ?? null,
                    'errors' => $errors,
                ]);

                $user->public_key = null;
                $user->private_key_encrypted = null;
                return;
            }

            // Extract the private key
            $privateKey = null;
            $exported = @openssl_pkey_export($res, $privateKey);

            if (!$exported || empty($privateKey)) {
                $errors = [];
                while ($msg = openssl_error_string()) {
                    $errors[] = $msg;
                }

                Log::warning('OpenSSL private key export failed; creating user without encryption keys.', [
                    'email' => $user->email ?? null,
                    'errors' => $errors,
                ]);

                $user->public_key = null;
                $user->private_key_encrypted = null;
                return;
            }

            // Extract the public key
            $details = @openssl_pkey_get_details($res);
            $publicKey = is_array($details) ? ($details['key'] ?? null) : null;

            if (empty($publicKey) || !is_string($publicKey)) {
                $errors = [];
                while ($msg = openssl_error_string()) {
                    $errors[] = $msg;
                }

                Log::warning('OpenSSL public key extraction failed; creating user without encryption keys.', [
                    'email' => $user->email ?? null,
                    'errors' => $errors,
                ]);

                $user->public_key = null;
                $user->private_key_encrypted = null;
                return;
            }

            // Store the public key and encrypted private key
            $user->public_key = $publicKey;
            $user->private_key_encrypted = Crypt::encryptString($privateKey);
        });
    }

    public function getRoleNameAttribute()
    {
        return [
            self::ROLE_WHISTLEBLOWER => 'Whistleblower',
            self::ROLE_INVESTIGATOR => 'Investigator',
            self::ROLE_ADMIN => 'Administrator',
            self::ROLE_EXTERNAL_AUTHORITY => 'External Authority',
        ][$this->role] ?? 'Unknown';
    }

    public function getPrivateKeyAttribute()
    {
        if (empty($this->private_key_encrypted) || !is_string($this->private_key_encrypted)) {
            return null;
        }

        try {
            return Crypt::decryptString($this->private_key_encrypted);
        } catch (\Throwable $e) {
            Log::warning('Failed to decrypt user private key.', [
                'user_id' => $this->id ?? null,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    public function isAdmin(): bool
    {
        return $this->role === self::ROLE_ADMIN;
    }

    public function isInvestigator(): bool
    {
        return $this->role === self::ROLE_INVESTIGATOR;
    }

    public function isWhistleblower(): bool
    {
        return $this->role === self::ROLE_WHISTLEBLOWER;
    }

    public function isExternalAuthority(): bool
    {
        return $this->role === self::ROLE_EXTERNAL_AUTHORITY;
    }

    /**
     * Check if user can access a given case type.
     * Admins can see all types. Investigators only see their allowed types.
     */
    public function canAccessCaseType(string $type): bool
    {
        if ($this->isAdmin()) return true;
        if ($this->isWhistleblower()) return true;
        $allowed = $this->allowed_case_types;
        if (empty($allowed)) return true; // No restrictions = access all
        return in_array($type, $allowed, true);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
