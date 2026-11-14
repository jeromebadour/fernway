<?php

namespace Fernway\Laravel\Tests;

use Fernway\Laravel\FernwayServiceProvider;
use Orchestra\Testbench\TestCase as Orchestra;

abstract class TestCase extends Orchestra
{
    public const SECRET = 'whsec_test_0123456789abcdef';

    protected function getPackageProviders($app): array
    {
        return [FernwayServiceProvider::class];
    }

    protected function getPackageAliases($app): array
    {
        return ['Fernway' => \Fernway\Laravel\Facades\Fernway::class];
    }

    protected function defineEnvironment($app): void
    {
        $app['config']->set('fernway.url', 'https://fernway.test');
        $app['config']->set('fernway.key', 'fw_testkey1_secretpart');
        $app['config']->set('fernway.route', 'callback');
        $app['config']->set('fernway.webhooks.secret', self::SECRET);
        $app['config']->set('cache.default', 'array');
    }

    /** A webhook exactly as Fernway signs one. */
    protected function webhook(array $body, ?int $t = null, ?string $secret = null)
    {
        $raw = json_encode($body);
        $t ??= time();
        $sig = 't='.$t.',v1='.hash_hmac('sha256', $t.'.'.$raw, $secret ?? self::SECRET);

        return $this->call('POST', '/fernway/webhook', [], [], [], ['HTTP_FERNWAY_SIGNATURE' => $sig, 'CONTENT_TYPE' => 'application/json'], $raw);
    }

    protected static function accepted(string $number = 'FW 26 00817', bool $duplicate = false): array
    {
        return ['ok' => true, 'duplicate' => $duplicate, 'number' => $number, 'state' => 'picked_up',
            'links' => ['self' => 'https://fernway.test/api/v1/leads/FW-26-00817', 'receipt' => 'https://fernway.test/track/abc']];
    }
}
