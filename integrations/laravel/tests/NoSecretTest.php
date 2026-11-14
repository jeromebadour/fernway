<?php

namespace Fernway\Laravel\Tests;

class NoSecretTest extends TestCase
{
    protected function defineEnvironment($app): void
    {
        parent::defineEnvironment($app);
        $app['config']->set('fernway.webhooks.secret', null);
    }

    public function test_without_a_secret_there_is_no_webhook_route_to_reach(): void
    {
        $this->postJson('/fernway/webhook', ['id' => 'evt_1', 'type' => 'lead.signed'])->assertNotFound();
    }
}
