<?php

namespace Fernway\Laravel\Jobs;

use Fernway\Laravel\Client;
use Fernway\Laravel\Events\LeadNotSent;
use Fernway\Laravel\Events\LeadRefused;
use Fernway\Laravel\Events\LeadSent;
use Fernway\Laravel\Exceptions\KeyRefused;
use Fernway\Laravel\Exceptions\Refused;
use Fernway\Laravel\Exceptions\Unreachable;
use Fernway\Laravel\Lead;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

/**
 * Delivers one lead to Fernway from the queue. Every try carries the lead's own key, so a try that reached Fernway but
 * lost its answer can be repeated without a second lead. Busy or down: tried again on the config's back-off (or when
 * Fernway says, after a 429). Refused: never retried, LeadRefused says why. Out of tries, or a refused key: LeadNotSent.
 */
class SendLead implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries;

    public function __construct(public Lead $lead)
    {
        $this->tries = count((array) config('fernway.queue.backoff', [])) + 1;
    }

    public function backoff(): array
    {
        return array_values((array) config('fernway.queue.backoff', [10]));
    }

    public function handle(Client $client): void
    {
        try {
            $sent = $client->send($this->lead);
        } catch (Refused $e) {
            event(new LeadRefused($this->lead, $e->status, $e->problems));

            return;
        } catch (KeyRefused $e) {
            // No try will get through with this key; trying 7 times only delays saying so.
            $this->fail($e);

            return;
        } catch (Unreachable $e) {
            if ($e->retryAfter !== null && $this->attempts() < $this->tries) {
                $this->release($e->retryAfter);

                return;
            }
            throw $e;
        }
        event(new LeadSent($this->lead, $sent));
    }

    public function failed(?Throwable $e): void
    {
        event(new LeadNotSent($this->lead, $e?->getMessage() ?? 'The lead could not be sent.'));
    }
}
