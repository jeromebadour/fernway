<?php

namespace Fernway\Laravel\Console;

use Fernway\Laravel\Client;
use Fernway\Laravel\Exceptions\KeyRefused;
use Fernway\Laravel\Exceptions\Refused;
use Fernway\Laravel\Exceptions\Unreachable;
use Illuminate\Console\Command;

/** php artisan fernway:test: is the key live, does the route book meetings, and are webhooks set up. Sends nothing. */
class TestCommand extends Command
{
    protected $signature = 'fernway:test {route? : A booking route to read free times from (default: fernway.route)}';

    protected $description = 'Check the connection to Fernway: the API key, a booking route\'s free times, the webhook secret';

    public function handle(Client $client): int
    {
        try {
            $client->keyWorks();
            $this->components->info('Fernway accepted the API key ('.config('fernway.url').').');
        } catch (KeyRefused $e) {
            $this->components->error($e->getMessage());

            return self::FAILURE;
        } catch (Unreachable|Refused $e) {
            $this->components->error('Fernway could not be asked: '.$e->getMessage());

            return self::FAILURE;
        }

        $route = $this->argument('route') ?? config('fernway.route');
        if ($route) {
            try {
                $this->components->info("Route {$route} books meetings: ".count($client->slots($route)).' free times in the next 14 days.');
            } catch (Refused $e) {
                // Fernway says why in its own words (a route with no calendar takes leads but books nothing).
                $this->components->warn("Route {$route}: ".implode('; ', $e->problems));
            } catch (Unreachable $e) {
                $this->components->warn("Route {$route}: its calendar could not be read just now ({$e->getMessage()}).");
            }
        }

        $this->components->twoColumnDetail('Webhooks', config('fernway.webhooks.secret')
            ? url(config('fernway.webhooks.path'))
            : 'off (set FERNWAY_WEBHOOK_SECRET to receive them)');

        return self::SUCCESS;
    }
}
