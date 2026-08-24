// Issue #293: Typed MCP error codes.
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type BiResult<T> = std::result::Result<T, BiError>;

#[derive(Debug, Error, Serialize, Deserialize)]
#[serde(tag = "kind", content = "message")]
pub enum BiError {
    #[error("not found: {0}")]
    NotFound(String),

    #[error("invalid input: {0}")]
    Invalid(String),

    #[error("database error: {message}")]
    Db {
        message: String,
        code: Option<String>,
        extended: Option<i32>,
    },

    #[error("index error: {0}")]
    Index(String),

    #[error("embed error: {0}")]
    Embed(String),

    #[error("ingest error: {0}")]
    Ingest(String),

    #[error("io error: {0}")]
    Io(String),

    #[error("internal: {0}")]
    Internal(String),
}

impl From<rusqlite::Error> for BiError {
    fn from(e: rusqlite::Error) -> Self {
        let (code, extended) = e
            .sqlite_error()
            .map(|se| (Some(format!("{:?}", se.code)), Some(se.extended_code)))
            .unwrap_or((None, None));
        BiError::Db {
            message: e.to_string(),
            code,
            extended,
        }
    }
}
impl From<r2d2::Error> for BiError {
    fn from(e: r2d2::Error) -> Self {
        BiError::Db {
            message: e.to_string(),
            code: None,
            extended: None,
        }
    }
}
impl From<serde_json::Error> for BiError {
    fn from(e: serde_json::Error) -> Self {
        BiError::Internal(e.to_string())
    }
}
impl From<std::io::Error> for BiError {
    fn from(e: std::io::Error) -> Self {
        BiError::Io(e.to_string())
    }
}
impl From<anyhow::Error> for BiError {
    fn from(e: anyhow::Error) -> Self {
        BiError::Internal(format!("{e:#}"))
    }
}

pub type BoxError = Box<dyn std::error::Error + Send + Sync>;
