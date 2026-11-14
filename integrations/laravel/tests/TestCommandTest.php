<?php

namespace Fernway\Laravel\Tests;

use Illuminate\Support\Facades\Http;

class TestCommandTest extends TestCase
{
    public function test_a_live_key_and_a_booking_route_are_reported(): void
    {
        Http::fake([
            'fernway.test/api/v1/leads/FW-00-00000' => Http::response(['ok' => false, 'problems' => ['no lead with that number']], 404),
            'fernway.test/api/v1/routes/roof-check/slots' => Http::response(['ok' => true, 'route' => 'roof-check', 'slots' => ['2026-11-16T16:00:00.000Z', '2026-11-16T20:00:00.000Z']]),
        ]);
        $this->artisan('fernway:test', ['route' => 'roof-check'])
            ->expectsOutputToContain('Fernway accepted the API key')
            ->expectsOutputToContain('2 free times')
            ->assertSuccessful();
    }

    public function test_a_refused_key_fails_the_command(): void
    {
        Http::fake(['*' => Http::response(['ok' => false], 401)]);
        $this->artisan('fernway:test')->expectsOutputToContain('refused the API key')->assertFailed();
    }
}
