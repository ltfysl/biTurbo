// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Issue #376: Apple Silicon acceleration (CoreML / Metal EP).
// Issue #370: `biturbo-cli` shell companion binary.
// Issue #371: clap_complete + clap_mangen completions/man pages.

fn main() {
    // Force CPU-only ONNX Runtime before any library triggers ort init.
    std::env::set_var("ORT_DISABLE_CORE_ML", "1");
    std::env::set_var("ORT_DNNL_DISABLE", "1");
    biturbo_lib::run()
}
