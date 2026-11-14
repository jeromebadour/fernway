# Fernway for Laravel

Send your Laravel app's leads into GoHighLevel through [Fernway](https://fernway.jeromebadour.com), with retries that
never send a lead twice, and hear back through Fernway's signed webhooks as ordinary Laravel events.

Laravel 12 and 13, PHP 8.2 or later.

## Install

```bash
composer require jeromebadour/fernway-laravel
```

```dotenv
FERNWAY_KEY=fw_...              # Fernway console, API keys (shown once)
FERNWAY_ROUTE=callback          # the route a lead takes when it names none
FERNWAY_WEBHOOK_SECRET=whsec_...  # Fernway console, Webhooks (shown once); leave out to receive none
```

```bash
php artisan fernway:test roof-check   # the key, a booking route's free times, the webhook address
```

## Send a lead

```php
use Fernway\Laravel\Facades\Fernway;
use Fernway\Laravel\Lead;

$lead = Lead::to('roof-check')
    ->key("order-{$order->id}")            // your own id: sending it again never makes a second lead
    ->name('Dana', 'Whitfield')
    ->email('dana@example.com')
    ->phone('+1 253 555 0142')
    ->address('14 Cedar Ln', 'Tacoma', 'WA', '98406', 'US')
    ->message('Old roof, a leak by the chimney')
    ->at($slot);                           // booking routes: a time from Fernway::slots('roof-check')

Fernway::send($lead);       // queued; LeadSent or LeadRefused follows
$sent = Fernway::sendNow($lead);   // or now: $sent->number ("FW 26 00817"), $sent->receipt
```

Queued sends retry when Fernway is busy or can't be reached (10 s, 30 s, 2 min, 10 min, 30 min, 1 h; a 429 waits
as long as Fernway asks), always with the lead's own key, so a try whose answer was lost is never a second lead. A lead
Fernway refuses is never retried: `LeadRefused` carries Fernway's reasons, the field first. Out of tries, or a refused
key: `LeadNotSent`.

## Hear back

Add an endpoint in Fernway's console (Webhooks) pointing at `https://your-app/fernway/webhook` and set its secret.
Each delivery is checked (HMAC-SHA256 of the raw body, constant-time compare, five minutes either side) before it
becomes an event; a forged or replayed call gets a 400, and a retry of the same delivery fires once.

```php
use Fernway\Laravel\Events\LeadHeld;
use Fernway\Laravel\Events\LeadSignedFor;

Event::listen(fn (LeadSignedFor $e) => Order::where('waybill', $e->waybill())->update(['in_crm' => true]));
Event::listen(fn (LeadHeld $e) => Log::warning("GHL held {$e->waybill()}: {$e->reason()}"));
```

| Fernway event | Laravel event |
|---|---|
| `lead.picked_up` | `LeadPickedUp` |
| `lead.signed` | `LeadSignedFor` |
| `lead.held` | `LeadHeld` (`reason()`, in GHL's words) |
| `lead.returned` | `LeadReturned` |
| `lead.scored` | `LeadScored` (`score()`, 1 to 5) |
| `fernway.test` | `WebhookTest` |

## Tests

Its own tests run on Laravel 12 (PHP 8.2) and 13 (PHP 8.4). Fernway's CI also installs it into a fresh Laravel app
that sends real leads through Fernway into a stand-in GoHighLevel and receives Fernway's signed webhooks.

Built by [Jerome Badour](https://jeromebadour.com). All rights reserved.
