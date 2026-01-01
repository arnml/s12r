/**
 * Centralized error handling utilities for S12R.
 * Provides consistent error formatting, logging, and user feedback.
 */

export enum ErrorCategory {
  VIDEO_PROCESSING = 'VIDEO_PROCESSING',
  FFMPEG_EXECUTION = 'FFMPEG_EXECUTION',
  FILE_SYSTEM = 'FILE_SYSTEM',
  EVENT_TRACKING = 'EVENT_TRACKING',
  COORDINATE_VALIDATION = 'COORDINATE_VALIDATION',
}

export interface S12RError {
  category: ErrorCategory;
  code: string;
  message: string;
  details?: Record<string, any>;
  originalError?: Error;
  timestamp: number;
}

export class S12RErrorHandler {
  /**
   * Create a structured error with context.
   */
  static createError(
    category: ErrorCategory,
    code: string,
    message: string,
    details?: Record<string, any>,
    originalError?: Error
  ): S12RError {
    return {
      category,
      code,
      message,
      details,
      originalError,
      timestamp: Date.now(),
    };
  }

  /**
   * Handle FFmpeg-specific errors with better context.
   */
  static handleFFmpegError(error: Error, context: Record<string, any>): S12RError {
    const message = error.message;
    
    // Detect specific FFmpeg error patterns
    if (message.includes('Error reinitializing filters')) {
      return this.createError(
        ErrorCategory.FFMPEG_EXECUTION,
        'FILTER_REINITIALIZATION_FAILED',
        'FFmpeg filter complexity exceeded limits. Try reducing the number of zoom events.',
        { ...context, suggestion: 'Reduce event count or simplify expressions' },
        error
      );
    }
    
    if (message.includes('Invalid argument')) {
      return this.createError(
        ErrorCategory.FFMPEG_EXECUTION,
        'INVALID_FILTER_ARGUMENT',
        'FFmpeg filter received invalid parameters.',
        { ...context, suggestion: 'Check coordinate bounds and expression syntax' },
        error
      );
    }
    
    return this.createError(
      ErrorCategory.FFMPEG_EXECUTION,
      'UNKNOWN_FFMPEG_ERROR',
      `FFmpeg processing failed: ${message}`,
      context,
      error
    );
  }

  /**
   * Log error with appropriate level and formatting.
   */
  static logError(error: S12RError): void {
    const prefix = `[${error.category}:${error.code}]`;
    console.error(`${prefix} ${error.message}`);
    
    if (error.details) {
      console.error(`${prefix} Details:`, error.details);
    }
    
    if (error.originalError) {
      console.error(`${prefix} Original error:`, error.originalError);
    }
  }

  /**
   * Convert error to user-friendly message.
   */
  static getUserMessage(error: S12RError): string {
    switch (error.code) {
      case 'FILTER_REINITIALIZATION_FAILED':
        return 'Video processing failed due to complexity. Try recording with fewer focus events.';
      case 'INVALID_FILTER_ARGUMENT':
        return 'Video processing failed due to invalid parameters. Please try again.';
      case 'FILE_NOT_FOUND':
        return 'The video file could not be found. Please try recording again.';
      default:
        return `Processing failed: ${error.message}`;
    }
  }
}

/**
 * Decorator for automatic error handling in async functions.
 */
export function handleErrors(category: ErrorCategory) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      try {
        return await method.apply(this, args);
      } catch (error) {
        const s12rError = S12RErrorHandler.createError(
          category,
          'UNHANDLED_ERROR',
          `Error in ${propertyName}`,
          { args: args.map(arg => typeof arg) },
          error instanceof Error ? error : new Error(String(error))
        );
        
        S12RErrorHandler.logError(s12rError);
        throw s12rError;
      }
    };
  };
}