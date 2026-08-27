use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::Instant;

/// Thread-safe rate limiter with configurable request limits and randomized jitter delay.
#[derive(Clone)]
pub struct RequestRateLimiter {
    requests_per_sec: u32,
    jitter_min_ms: u64,
    jitter_max_ms: u64,
    last_request: Arc<Mutex<Option<Instant>>>,
}

impl RequestRateLimiter {
    pub fn new(requests_per_sec: u32, jitter_min_ms: u64, jitter_max_ms: u64) -> Self {
        Self {
            requests_per_sec: requests_per_sec.max(1),
            jitter_min_ms,
            jitter_max_ms,
            last_request: Arc::new(Mutex::new(None)),
        }
    }

    /// Default rate limiter for unauthenticated requests (3 req/sec, 50-200ms jitter)
    pub fn default_public() -> Self {
        Self::new(3, 50, 200)
    }

    /// Accelerated rate limiter for authenticated requests with API key (10 req/sec, 30-100ms jitter)
    pub fn default_with_api_key() -> Self {
        Self::new(10, 30, 100)
    }

    /// Wait until the rate limit interval and random jitter delay have elapsed.
    pub async fn wait(&self) {
        let min_interval = Duration::from_secs_f64(1.0 / self.requests_per_sec as f64);

        let jitter_ms = if self.jitter_max_ms > self.jitter_min_ms {
            let mut rng = rand::thread_rng();
            rand::Rng::gen_range(&mut rng, self.jitter_min_ms..=self.jitter_max_ms)
        } else {
            self.jitter_min_ms
        };

        let jitter_duration = Duration::from_millis(jitter_ms);
        let total_delay = min_interval + jitter_duration;

        let mut lock = self.last_request.lock().await;
        if let Some(last) = *lock {
            let elapsed = last.elapsed();
            if elapsed < total_delay {
                let sleep_time = total_delay - elapsed;
                tokio::time::sleep(sleep_time).await;
            }
        }

        *lock = Some(Instant::now());
    }
}
