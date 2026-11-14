<?php

namespace Fernway\Laravel\Http;

use Fernway\Laravel\Events;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/** A checked webhook becomes a Laravel event. A retry carries the same id: it is answered, never fired twice. */
class WebhookController
{
    private const EVENTS = [
        'lead.picked_up' => Events\LeadPickedUp::class,
        'lead.signed' => Events\LeadSignedFor::class,
        'lead.held' => Events\LeadHeld::class,
        'lead.returned' => Events\LeadReturned::class,
        'lead.scored' => Events\LeadScored::class,
        'fernway.test' => Events\WebhookTest::class,
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $body = json_decode($request->getContent(), true);
        $id = is_array($body) ? (string) ($body['id'] ?? '') : '';
        $class = is_array($body) ? (self::EVENTS[$body['type'] ?? ''] ?? null) : null;
        if ($id === '' || $class === null) {
            // Signed, so it is Fernway's: an event this version doesn't know is taken quietly, never retried for ever.
            return response()->json(['received' => true, 'known' => false]);
        }
        // Fernway keeps a delivery 30 days; a repeat inside that is the same event.
        if (! Cache::add('fernway:webhook:'.$id, true, now()->addDays(31))) {
            return response()->json(['received' => true, 'duplicate' => true]);
        }
        try {
            event(new $class($id, (string) $body['type'], (string) ($body['created'] ?? ''), (array) ($body['data'] ?? [])));
        } catch (\Throwable $e) {
            // The app's own listener failed: forget the id, so Fernway's retry runs it again instead of being dropped.
            Cache::forget('fernway:webhook:'.$id);
            throw $e;
        }

        return response()->json(['received' => true]);
    }
}
