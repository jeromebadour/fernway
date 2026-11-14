<?php

namespace Fernway\Laravel\Tests;

use Fernway\Laravel\Events\LeadNotSent;
use Fernway\Laravel\Events\LeadRefused;
use Fernway\Laravel\Events\LeadSent;
use Fernway\Laravel\Exceptions\KeyRefused;
use Fernway\Laravel\Exceptions\Unreachable;
use Fernway\Laravel\Facades\Fernway;
use Fernway\Laravel\Jobs\SendLead;
use Fernway\Laravel\Lead;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

class SendLeadTest extends TestCase
{
    public function test_send_queues_the_lead_on_the_configured_queue_and_hands_back_its_key(): void
    {
        Queue::fake();
        config(['fernway.queue.name' => 'leads']);
        $this->app->forgetInstance(\Fernway\Laravel\Fernway::class);
        $lead = Lead::to()->email('a@b.co')->key('order-1001');
        $this->assertSame('order-1001', Fernway::send($lead));
        Queue::assertPushedOn('leads', SendLead::class, fn (SendLead $job) => $job->lead->idempotencyKey() === 'order-1001');
    }

    public function test_tries_follow_the_back_off_list(): void
    {
        $job = new SendLead(Lead::to()->email('a@b.co'));
        $this->assertSame(7, $job->tries);
        $this->assertSame([10, 30, 120, 600, 1800, 3600], $job->backoff());
    }

    public function test_taken_fires_lead_sent_with_the_waybill(): void
    {
        Event::fake([LeadSent::class]);
        Http::fake(['*' => Http::response(self::accepted('FW 26 00900'), 201)]);
        (new SendLead(Lead::to()->email('a@b.co')))->withFakeQueueInteractions()->handle(app(\Fernway\Laravel\Client::class));
        Event::assertDispatched(LeadSent::class, fn (LeadSent $e) => $e->sent->number === 'FW 26 00900');
    }

    public function test_refused_fires_lead_refused_and_is_never_tried_again(): void
    {
        Event::fake([LeadRefused::class]);
        Http::fake(['*' => Http::response(['ok' => false, 'problems' => ['contact.phone: a phone number with country code']], 422)]);
        $job = (new SendLead(Lead::to()->phone('12')))->withFakeQueueInteractions();
        $job->handle(app(\Fernway\Laravel\Client::class));
        $job->assertNotReleased();
        $job->assertNotFailed();
        Event::assertDispatched(LeadRefused::class, fn (LeadRefused $e) => $e->status === 422 && $e->problems === ['contact.phone: a phone number with country code']);
    }

    public function test_rate_limited_waits_as_long_as_fernway_asks(): void
    {
        Http::fake(['*' => Http::response(['ok' => false], 429, ['Retry-After' => '45'])]);
        $job = (new SendLead(Lead::to()->email('a@b.co')))->withFakeQueueInteractions();
        $job->handle(app(\Fernway\Laravel\Client::class));
        $job->assertReleased(45);
    }

    public function test_down_throws_so_the_queue_tries_again_on_the_back_off(): void
    {
        Http::fake(['*' => Http::response('', 502)]);
        $this->expectException(Unreachable::class);
        (new SendLead(Lead::to()->email('a@b.co')))->withFakeQueueInteractions()->handle(app(\Fernway\Laravel\Client::class));
    }

    public function test_a_refused_key_fails_at_once_instead_of_seven_times(): void
    {
        Http::fake(['*' => Http::response(['ok' => false], 401)]);
        $job = (new SendLead(Lead::to()->email('a@b.co')))->withFakeQueueInteractions();
        $job->handle(app(\Fernway\Laravel\Client::class));
        $job->assertFailedWith(KeyRefused::class);
    }

    public function test_out_of_tries_fires_lead_not_sent(): void
    {
        Event::fake([LeadNotSent::class]);
        (new SendLead(Lead::to()->email('a@b.co')->key('order-1001')))->failed(new Unreachable('Fernway answered 503.'));
        Event::assertDispatched(LeadNotSent::class, fn (LeadNotSent $e) => $e->lead->idempotencyKey() === 'order-1001' && str_contains($e->reason, '503'));
    }

    public function test_every_try_of_a_lead_carries_the_same_key(): void
    {
        Http::fake(['*' => Http::sequence()->push('', 503)->push(self::accepted(), 201)]);
        $lead = unserialize(serialize(Lead::to()->email('a@b.co')));
        $client = app(\Fernway\Laravel\Client::class);
        try {
            (new SendLead($lead))->withFakeQueueInteractions()->handle($client);
        } catch (Unreachable) {
        }
        (new SendLead(unserialize(serialize($lead))))->withFakeQueueInteractions()->handle($client);
        $keys = Http::recorded()->map(fn ($pair) => $pair[0]['idempotencyKey'])->unique();
        $this->assertCount(1, $keys);
        $this->assertSame($lead->idempotencyKey(), $keys->first());
    }
}
