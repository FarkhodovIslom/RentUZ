import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Registry, Gauge, Histogram, Counter, collectDefaultMetrics } from 'prom-client';
import { Public } from '../common/decorators/public.decorator.js';

/**
 * Prometheus metrics endpoint (8_Phase.md §1.5 item 34, §72): queue backlog,
 * HTTP latency histogram, active WS connections + the prom-client defaults
 * (event loop lag, GC, memory). Scraped by Render's / APM's collector.
 *
 * Public by design: counters expose no user data, only aggregate health. The
 * production edge (Render) should restrict /metrics to the internal scraper
 * via the runbook's firewall guidance.
 */
@ApiTags('ops')
@Controller()
@Public()
export class MetricsController {
  private readonly registry: Registry;
  readonly httpDuration: Histogram<string>;
  readonly wsConnections: Gauge<string>;
  readonly queueBacklog: Gauge<string>;
  readonly httpTotal: Counter<string>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.httpDuration = new Histogram({
      name: 'rentuz_http_request_duration_seconds',
      help: 'HTTP request latency by route + method',
      labelNames: ['route', 'method', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 0.8, 1.5, 3, 10],
      registers: [this.registry],
    });
    this.httpTotal = new Counter({
      name: 'rentuz_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['route', 'method', 'status'],
      registers: [this.registry],
    });
    this.wsConnections = new Gauge({
      name: 'rentuz_ws_active_connections',
      help: 'Active Socket.IO connections',
      registers: [this.registry],
    });
    this.queueBacklog = new Gauge({
      name: 'rentuz_queue_backlog_jobs',
      help: 'BullMQ waiting job count per queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });
  }

  @Get('metrics')
  async metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
