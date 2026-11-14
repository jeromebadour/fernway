<?php

namespace Fernway\Laravel\Tests;

use Fernway\Laravel\Exceptions\KeyRefused;
use Fernway\Laravel\Exceptions\Refused;
use Fernway\Laravel\Exceptions\Unreachable;
use Fernway\Laravel\Facades\Fernway;
use Fernway\Laravel\Lead;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

class ClientTest extends TestCase
{
    public function test_a_taken_lead_gives_its_waybill_and_receipt_and_the_request_carries_the_key(): void
    {
        Http::fake(['fernway.test/api/v1/leads' => Http::response(self::accepted(), 201)]);
        $lead = Lead::to()->email('a@b.co')->key('order-1001');
        $sent = Fernway::sendNow($lead);
        $this->assertSame('FW 26 00817', $sent->number);
        $this->assertSame('https://fernway.test/track/abc', $sent->receipt);
        $this->assertFalse($sent->duplicate);
        $this->assertSame('order-1001', $sent->key);
        Http::assertSent(fn (Request $r) => $r->method() === 'POST'
            && $r->hasHeader('Authorization', 'Bearer fw_testkey1_secretpart')
            && str_starts_with($r->header('User-Agent')[0], 'Fernway-Laravel/')
            && $r['idempotencyKey'] === 'order-1001' && $r['route'] === 'callback' && $r['source'] === 'laravel');
    }

    public function test_the_same_lead_again_is_the_same_waybill(): void
    {
        Http::fake(['*' => Http::response(self::accepted(duplicate: true), 200)]);
        $this->assertTrue(Fernway::sendNow(Lead::to()->email('a@b.co'))->duplicate);
    }

    public function test_a_refused_lead_says_why_in_fernways_words(): void
    {
        Http::fake(['*' => Http::response(['ok' => false, 'problems' => ['contact.email: a real email address']], 422)]);
        try {
            Fernway::sendNow(Lead::to()->email('nope'));
            $this->fail('no exception');
        } catch (Refused $e) {
            $this->assertSame(422, $e->status);
            $this->assertSame(['contact.email: a real email address'], $e->problems);
        }
    }

    public function test_a_time_taken_in_between_is_a_refusal_not_a_retry(): void
    {
        Http::fake(['*' => Http::response(['ok' => false, 'problems' => ['slot: someone took that time; pick another']], 409)]);
        $this->expectException(Refused::class);
        Fernway::sendNow(Lead::to('roof-check')->email('a@b.co')->at('2026-11-16T16:00:00Z'));
    }

    public function test_busy_and_down_are_worth_another_try_and_429_says_when(): void
    {
        Http::fake(['*' => Http::sequence()->push(['ok' => false], 429, ['Retry-After' => '30'])->push('', 503)]);
        try {
            Fernway::sendNow(Lead::to()->email('a@b.co'));
            $this->fail('no exception');
        } catch (Unreachable $e) {
            $this->assertSame(429, $e->status);
            $this->assertSame(30, $e->retryAfter);
        }
        try {
            Fernway::sendNow(Lead::to()->email('a@b.co'));
            $this->fail('no exception');
        } catch (Unreachable $e) {
            $this->assertSame(503, $e->status);
            $this->assertNull($e->retryAfter);
        }
    }

    public function test_no_answer_at_all_is_unreachable(): void
    {
        Http::fake(fn () => Http::failedConnection());
        $this->expectException(Unreachable::class);
        Fernway::sendNow(Lead::to()->email('a@b.co'));
    }

    public function test_a_wrong_or_missing_key_is_named_as_such(): void
    {
        Http::fake(['*' => Http::response(['ok' => false, 'problems' => ['no live API key']], 401)]);
        $this->expectException(KeyRefused::class);
        Fernway::sendNow(Lead::to()->email('a@b.co'));
    }

    public function test_no_key_configured_sends_nothing(): void
    {
        config(['fernway.key' => null]);
        $this->app->forgetInstance(\Fernway\Laravel\Client::class);
        $this->app->forgetInstance(\Fernway\Laravel\Fernway::class);
        Http::fake();
        try {
            Fernway::sendNow(Lead::to()->email('a@b.co'));
            $this->fail('no exception');
        } catch (KeyRefused) {
            Http::assertNothingSent();
        }
    }

    public function test_free_times_and_a_lead_by_number(): void
    {
        Http::fake([
            'fernway.test/api/v1/routes/roof-check/slots' => Http::response(['ok' => true, 'route' => 'roof-check', 'slots' => ['2026-11-16T16:00:00.000Z', '2026-11-16T20:00:00.000Z']]),
            'fernway.test/api/v1/leads/FW-26-00817' => Http::response(['ok' => true, 'lead' => ['number' => 'FW 26 00817', 'state' => 'signed', 'scans' => []]]),
        ]);
        $this->assertSame(['2026-11-16T16:00:00.000Z', '2026-11-16T20:00:00.000Z'], Fernway::slots('roof-check'));
        $this->assertSame('signed', Fernway::lead('FW 26 00817')['state']);
    }
}
