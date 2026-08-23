// Standalone MCP server binary. Spawned by AI agents via stdio.
// Listens on stdin/stdout for JSON-RPC 2.0 (MCP protocol).
use anyhow::Result;
use biturbo_lib::mcp::run_mcp_server_stdio;
use std::path::PathBuf;
use tracing_subscriber::fmt::layer;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    // Force CPU-only ONNX Runtime before any library triggers ort init.
    std::env::set_var("ORT_DISABLE_CORE_ML", "1");
    std::env::set_var("ORT_DNNL_DISABLE", "1");

    let data_dir = std::env::var_os("BITURBO_DATA_DIR")
        .map(PathBuf::from)
        .or_else(|| {
            dirs::data_dir()
                .map(|d| d.join(biturbo_lib::APP_DIR_NAME))
                .or_else(|| {
                    eprintln!("BITURBO_DATA_DIR not set and OS data directory is unavailable");
                    None
                })
        })
        .ok_or_else(|| anyhow::anyhow!("cannot determine biTurbo data directory"))?;
    let log_dir = data_dir.join("logs");

    let file_appender = tracing_appender::rolling::daily(&log_dir, "biturbo-mcp.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    std::mem::forget(_guard);

    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| "warn".into());

    tracing_subscriber::registry()
        .with(env_filter)
        .with(
            layer()
                .compact()
                .with_target(false)
                .with_writer(std::io::stderr),
        )
        .with(
            layer()
                .compact()
                .with_target(true)
                .with_writer(non_blocking),
        )
        .init();

    run_mcp_server_stdio().await
}
