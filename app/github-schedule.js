// One timer per open view. The sync lock and durable last-check timestamp
// coalesce checks from tabs that share this library.
export function autoSync({work, available, clock = Date.now, timers = globalThis}) {
  let timer, running = false, pending = false, blocked = false, failures = 0, retryAt = 0;
  function stop() { timers.clearTimeout(timer); timer = undefined; }
  function schedule(delay = 0) {
    stop();
    if (blocked || !available()) return;
    if (running) { pending = true; return; }
    timer = timers.setTimeout(tick, Math.max(delay, retryAt - clock()));
  }
  async function tick() {
    if (!available() || blocked || running) return;
    running = true;
    pending = false;
    try {
      const result = await work();
      blocked = !!result?.pause;
      pending ||= !!result?.pending;
      failures = 0;
      retryAt = 0;
    } catch (error) {
      failures++;
      retryAt = clock() + Math.max(error.retryAfter || 0, Math.min(900000, 5000 * 2 ** Math.min(failures - 1, 8)));
    } finally {
      running = false;
      schedule(pending ? 1200 : failures ? 0 : 45000);
    }
  }
  return {schedule, stop, pause() { blocked = true; stop(); }, resume() { blocked = false; retryAt = 0; failures = 0; schedule(); }};
}
