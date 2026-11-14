<?php

namespace Fernway\Laravel\Tests;

use Fernway\Laravel\Events\LeadHeld;
use Fernway\Laravel\Events\LeadScored;
use Fernway\Laravel\Events\LeadSignedFor;
use Fernway\Laravel\Events\WebhookTest as WebhookTestEvent;
use Illuminate\Support\Facades\Event;
use RuntimeException;

class WebhookTest extends TestCase
{
    private static function body(string $type = 'lead.signed', string $id = 'evt_3fJ9kQ0vLr2mXp7aZt1cWn8e', array $data = []): array
    {
        return ['id' => $id, 'type' => $type, 'created' => '2026-11-12T14:03:11.402Z',
            'data' => $data + ['waybill' => 'FW 26 00817', 'state' => 'signed', 'reason' => null, 'contact' => ['email' => 'lena@northpine.dental'], 'score' => null]];
    }

    public function test_a_signed_delivery_becomes_its_laravel_event(): void
    {
        Event::fake([LeadSignedFor::class]);
        $this->webhook(self::body())->assertOk()->assertJson(['received' => true]);
        Event::assertDispatched(LeadSignedFor::class, fn (LeadSignedFor $e) => $e->waybill() === 'FW 26 00817' && $e->contact()['email'] === 'lena@northpine.dental');
    }

    public function test_held_and_scored_carry_their_own_facts(): void
    {
        Event::fake([LeadHeld::class, LeadScored::class, WebhookTestEvent::class]);
        $this->webhook(self::body('lead.held', 'evt_held_0001', ['reason' => 'The email address is invalid']))->assertOk();
        $this->webhook(self::body('lead.scored', 'evt_score_0001', ['score' => ['score' => 5, 'summary' => 'Ready to start']]))->assertOk();
        $this->webhook(['id' => 'evt_test_0001', 'type' => 'fernway.test', 'created' => '2026-11-12T14:03:11.402Z', 'data' => []])->assertOk();
        Event::assertDispatched(LeadHeld::class, fn (LeadHeld $e) => $e->reason() === 'The email address is invalid');
        Event::assertDispatched(LeadScored::class, fn (LeadScored $e) => $e->score() === 5);
        Event::assertDispatched(WebhookTestEvent::class);
    }

    public function test_a_wrong_secret_a_missing_signature_or_an_old_call_is_refused(): void
    {
        Event::fake();
        $this->webhook(self::body(), secret: 'whsec_someone_else')->assertStatus(400);
        $this->webhook(self::body(), t: time() - 301)->assertStatus(400);
        $this->postJson('/fernway/webhook', self::body())->assertStatus(400);
        Event::assertNothingDispatched();
    }

    public function test_the_body_is_checked_as_sent_so_one_changed_byte_fails(): void
    {
        Event::fake();
        $raw = json_encode(self::body());
        $t = time();
        $sig = 't='.$t.',v1='.hash_hmac('sha256', $t.'.'.$raw, self::SECRET);
        $this->call('POST', '/fernway/webhook', [], [], [], ['HTTP_FERNWAY_SIGNATURE' => $sig, 'CONTENT_TYPE' => 'application/json'], str_replace('00817', '00818', $raw))->assertStatus(400);
        Event::assertNothingDispatched();
    }

    public function test_a_retry_of_the_same_delivery_fires_once(): void
    {
        Event::fake([LeadSignedFor::class]);
        $this->webhook(self::body())->assertOk();
        $this->webhook(self::body())->assertOk()->assertJson(['duplicate' => true]);
        Event::assertDispatchedTimes(LeadSignedFor::class, 1);
    }

    public function test_when_the_apps_own_listener_fails_fernways_retry_runs_it_again(): void
    {
        $calls = 0;
        Event::listen(LeadSignedFor::class, function () use (&$calls) {
            if (++$calls === 1) {
                throw new RuntimeException('database busy');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->webhook(self::body());
        } catch (RuntimeException) {
        }
        $this->webhook(self::body())->assertOk()->assertJsonMissing(['duplicate' => true]);
        $this->assertSame(2, $calls);
    }

    public function test_an_event_this_version_does_not_know_is_taken_quietly(): void
    {
        Event::fake();
        $this->webhook(self::body('lead.something_new'))->assertOk()->assertJson(['known' => false]);
        Event::assertNothingDispatched();
    }
}
