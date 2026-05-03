<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use App\Models\InvestigationLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Laravel\Sanctum\Sanctum;
use Illuminate\Support\Str;

class InvestigationLogTest extends TestCase
{
    use RefreshDatabase;

    protected function createReport($data = [])
    {
        return Report::create(array_merge([
            'case_id' => 'ZACC-' . rand(1000, 9999),
            'reference_code' => 'ZACC-REF-' . Str::random(6),
            'type' => 'Bribery',
            'institution' => 'Test Inst',
            'description' => 'Plain description',
            'status' => 'SUBMITTED',
            'user_id' => User::factory()->create()->id
        ], $data));
    }

    public function test_investigator_can_add_log_note()
    {
        $investigator = User::factory()->create(['role' => 'INVESTIGATOR']);
        $report = $this->createReport();

        Sanctum::actingAs($investigator);

        $response = $this->postJson("/api/reports/{$report->id}/logs", [
            'note' => 'Suspect interviewed.'
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('note', 'Suspect interviewed.')
            ->assertJsonPath('user.name', $investigator->name);

        $this->assertDatabaseHas('investigation_logs', [
            'report_id' => $report->id,
            'user_id' => $investigator->id,
            'note' => 'Suspect interviewed.'
        ]);
    }

    public function test_authority_feedback_is_logged()
    {
        $authorityUser = User::factory()->create([
            'role' => 'EXTERNAL_AUTHORITY',
            'institution' => 'NPA'
        ]);
        $report = $this->createReport([
            'status' => 'REFERRED',
            'referred_to_authority' => 'NPA'
        ]);

        Sanctum::actingAs($authorityUser);

        $response = $this->postJson("/api/reports/{$report->id}/logs", [
            'note' => '[AUTHORITY FEEDBACK]: Prosecution initiated.',
            'metadata' => ['is_authority_feedback' => true]
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('investigation_logs', [
            'report_id' => $report->id,
            'note' => '[AUTHORITY FEEDBACK]: Prosecution initiated.'
        ]);
    }
}
