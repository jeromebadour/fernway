<?php

namespace Fernway\Laravel;

use Fernway\Laravel\Console\TestCommand;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\ServiceProvider;

class FernwayServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/fernway.php', 'fernway');
        $this->app->singleton(Client::class, fn ($app) => new Client($app->make(Factory::class), $app['config']->get('fernway')));
        $this->app->singleton(Fernway::class, fn ($app) => new Fernway($app->make(Client::class), $app['config']->get('fernway')));
    }

    public function boot(): void
    {
        // No secret, no route: an endpoint that can't check signatures is never left open.
        if (config('fernway.webhooks.secret')) {
            $this->loadRoutesFrom(__DIR__.'/../routes/webhooks.php');
        }
        if ($this->app->runningInConsole()) {
            $this->publishes([__DIR__.'/../config/fernway.php' => config_path('fernway.php')], 'fernway-config');
            $this->commands([TestCommand::class]);
        }
    }
}
