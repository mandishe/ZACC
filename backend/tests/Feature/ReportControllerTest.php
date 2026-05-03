<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;
use Laravel\Sanctum\Sanctum;
use Illuminate\Support\Str;

class ReportControllerTest extends TestCase
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

    public function test_investigator_can_view_decrypted_report()
    {
        $investigator = User::factory()->create(['role' => 'INVESTIGATOR']);

        $description = 'Secret corruption details';
        $report = $this->createReport([
            'is_encrypted' => true,
            'encrypted_data' => Crypt::encryptString(json_encode(['description' => $description]))
        ]);

        Sanctum::actingAs($investigator);

        $response = $this->getJson("/api/reports/{$report->id}");

        $response->assertStatus(200)
            ->assertJsonPath('description', $description);
    }

    public function test_status_update_with_referral()
    {
        $investigator = User::factory()->create(['role' => 'INVESTIGATOR']);
        $report = $this->createReport(['status' => 'SUBMITTED']);

        Sanctum::actingAs($investigator);

        $response = $this->putJson("/api/reports/{$report->id}/status", [
            'status' => 'REFERRED',
            'referred_to_authority' => 'NPA'
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('status', 'REFERRED')
            ->assertJsonPath('referred_to_authority', 'NPA');

        $this->assertDatabaseHas('reports', [
            'id' => $report->id,
            'status' => 'REFERRED',
            'referred_to_authority' => 'NPA'
        ]);
    }

    public function test_external_authority_can_only_see_referred_cases()
    {
        $authorityUser = User::factory()->create([
            'role' => 'EXTERNAL_AUTHORITY',
            'institution' => 'NPA'
        ]);

        $referredCase = $this->createReport([
            'status' => 'REFERRED',
            'referred_to_authority' => 'NPA'
        ]);

        $otherCase = $this->createReport([
            'status' => 'SUBMITTED'
        ]);

        Sanctum::actingAs($authorityUser);

        $response = $this->getJson("/api/reports");

        $response->assertStatus(200)
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $referredCase->id);
    }
}
