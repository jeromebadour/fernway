<?php

namespace Fernway\Laravel\Tests;

use Fernway\Laravel\Lead;
use InvalidArgumentException;

class LeadTest extends TestCase
{
    public function test_a_lead_is_the_body_fernway_takes_and_names_itself_laravel(): void
    {
        $lead = Lead::to('roof-check')->name('Dana', 'Whitfield')->email(' dana@example.com ')->phone('253 555 0142')
            ->company('Northpine')->message('Old roof')->address('14 Cedar Ln', 'Tacoma', 'WA', '98406', 'US')->at('2026-11-16T16:00:00.000Z');
        $body = $lead->toArray();
        $this->assertSame('laravel', $body['source']);
        $this->assertSame('roof-check', $body['route']);
        $this->assertSame('2026-11-16T16:00:00.000Z', $body['slot']);
        $this->assertSame(['firstName' => 'Dana', 'lastName' => 'Whitfield', 'email' => 'dana@example.com', 'phone' => '253 555 0142',
            'companyName' => 'Northpine', 'message' => 'Old roof',
            'address' => ['line1' => '14 Cedar Ln', 'city' => 'Tacoma', 'state' => 'WA', 'postalCode' => '98406', 'country' => 'US']], $body['contact']);
        $this->assertMatchesRegularExpression('/^laravel-[0-9a-f-]{36}$/', $body['idempotencyKey']);
    }

    public function test_empty_fields_are_left_out_not_sent_blank(): void
    {
        $body = Lead::to('callback')->email('a@b.co')->phone('')->company(null)->address(city: ' ')->toArray();
        $this->assertSame(['email' => 'a@b.co'], $body['contact']);
        $this->assertArrayNotHasKey('slot', $body);
    }

    public function test_the_key_survives_the_queue_so_every_try_is_the_same_lead(): void
    {
        $lead = Lead::to('callback')->email('a@b.co')->key('order-1001');
        $back = unserialize(serialize($lead));
        $this->assertSame('order-1001', $back->idempotencyKey());
        $this->assertSame($lead->toArray(), $back->toArray());
        $made = Lead::to('callback')->email('a@b.co');
        $this->assertSame($made->idempotencyKey(), unserialize(serialize($made))->idempotencyKey());
    }

    public function test_the_route_falls_back_to_the_config_and_none_at_all_is_said_plainly(): void
    {
        $this->assertSame('callback', Lead::to()->email('a@b.co')->toArray('callback')['route']);
        $this->expectException(InvalidArgumentException::class);
        Lead::to()->email('a@b.co')->toArray(null);
    }

    public function test_a_key_too_short_to_be_an_id_is_refused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Lead::to('callback')->key('abc');
    }
}
