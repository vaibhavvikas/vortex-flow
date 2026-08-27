use rand::Rng;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct RetryPolicy {
    pub max_retries: u32,
    pub initial_delay: Duration,
    pub max_delay: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_retries: 5,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
        }
    }
}

impl RetryPolicy {
    pub fn get_delay(&self, attempt: u32) -> Duration {
        let exp = 2u64.saturating_pow(attempt.min(10));
        let base_millis = self.initial_delay.as_millis() as u64 * exp;
        let capped_millis = base_millis.min(self.max_delay.as_millis() as u64);

        let jitter: u64 = rand::rng().random_range(0..=500);
        Duration::from_millis(capped_millis + jitter)
    }
}
