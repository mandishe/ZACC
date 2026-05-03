<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvestigationLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'report_id',
        'user_id',
        'note',
        'metadata'
    ];

    protected $casts = [
        'metadata' => 'array'
    ];

    public function report(): BelongsTo
    {
        return $this->belongsTo(Report::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
