//! Instructions module for the Counter program
//! 
//! This module contains all instruction handlers for the Counter program.
//! Each instruction is implemented in its own file for better organization.

pub mod initialize;
pub mod increment;

// Re-export instruction handlers
pub use initialize::*;
pub use increment::*;
