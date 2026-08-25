use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::broadcast;
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::layer::Context;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::Layer;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
  pub id: String,
  pub timestamp: String,
  pub level: String,
  pub source: String,
  pub message: String,
}

struct LogBuffer {
  capacity: usize,
  entries: VecDeque<LogEntry>,
  counter: u64,
}

impl LogBuffer {
  fn new(capacity: usize) -> Self {
    Self {
      capacity,
      entries: VecDeque::with_capacity(capacity),
      counter: 0,
    }
  }

  fn push(&mut self, level: String, source: String, message: String) -> LogEntry {
    self.counter += 1;
    let entry = LogEntry {
      id: self.counter.to_string(),
      timestamp: Local::now().format("%H:%M:%S%.3f").to_string(),
      level,
      source,
      message,
    };

    if self.entries.len() >= self.capacity {
      self.entries.pop_front();
    }
    self.entries.push_back(entry.clone());
    entry
  }

  fn get_all(&self) -> Vec<LogEntry> {
    self.entries.iter().cloned().collect()
  }
}

pub struct LogManager {
  buffer: Mutex<LogBuffer>,
  tx: broadcast::Sender<LogEntry>,
}

static LOG_MANAGER: OnceLock<Arc<LogManager>> = OnceLock::new();

pub fn get_log_manager() -> &'static Arc<LogManager> {
  LOG_MANAGER.get_or_init(|| {
    let (tx, _) = broadcast::channel(500);
    Arc::new(LogManager {
      buffer: Mutex::new(LogBuffer::new(200)),
      tx,
    })
  })
}

pub fn init_logging() {
  let manager = get_log_manager();
  let broadcast_layer = BroadcastTracingLayer {
    manager: Arc::clone(manager),
  };

  let filter = tracing_subscriber::EnvFilter::try_from_default_env()
    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

  let _ = tracing_subscriber::registry()
    .with(filter)
    .with(tracing_subscriber::fmt::layer())
    .with(broadcast_layer)
    .try_init();

  tracing::info!("VortexFlow Logging Engine initialized.");
}

pub fn get_buffered_logs() -> Vec<LogEntry> {
  get_log_manager().buffer.lock().unwrap().get_all()
}

pub fn subscribe_logs() -> broadcast::Receiver<LogEntry> {
  get_log_manager().tx.subscribe()
}

struct MessageVisitor(String);

impl Visit for MessageVisitor {
  fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
    if field.name() == "message" {
      self.0 = format!("{:?}", value);
    } else if self.0.is_empty() {
      self.0 = format!("{}: {:?}", field.name(), value);
    } else {
      self.0.push_str(&format!(", {}: {:?}", field.name(), value));
    }
  }

  fn record_str(&mut self, field: &Field, value: &str) {
    if field.name() == "message" {
      self.0 = value.to_string();
    } else if self.0.is_empty() {
      self.0 = format!("{}: {}", field.name(), value);
    } else {
      self.0.push_str(&format!(", {}: {}", field.name(), value));
    }
  }
}

pub struct BroadcastTracingLayer {
  manager: Arc<LogManager>,
}

impl<S> Layer<S> for BroadcastTracingLayer
where
  S: Subscriber,
{
  fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
    let mut visitor = MessageVisitor(String::new());
    event.record(&mut visitor);

    let level_str = match *event.metadata().level() {
      Level::ERROR => "error",
      Level::WARN => "warn",
      Level::INFO => "info",
      Level::DEBUG => "debug",
      Level::TRACE => "trace",
    };

    let target = event.metadata().target();
    let source = target.split("::").next().unwrap_or(target);

    let entry = self.manager.buffer.lock().unwrap().push(
      level_str.to_string(),
      source.to_string(),
      visitor.0,
    );

    let _ = self.manager.tx.send(entry);
  }
}
