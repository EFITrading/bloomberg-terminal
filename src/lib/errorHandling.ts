// User-friendly error handling and messaging utilities

interface UserFriendlyError {
 userMessage: string;
 technicalMessage: string;
 suggestedAction: string;
 severity: 'info' | 'warning' | 'error';
 retryable: boolean;
}

// Map technical errors to user-friendly messages
export function createUserFriendlyError(error: Error | string): UserFriendlyError {
 const errorMsg = typeof error === 'string' ? error : error.message;
 const errorName = typeof error === 'string' ? 'Error' : error.name;

 // Connection and network errors
 if (errorMsg.includes('ERR_CONNECTION_RESET') || 
 errorMsg.includes('ERR_CONNECTION_REFUSED') ||
 errorMsg.includes('net::ERR_CONNECTION') ||
 errorMsg.includes('Failed to fetch')) {
 return {
 userMessage: 'Unable to connect to data provider',
 technicalMessage: errorMsg,
 suggestedAction: 'Please check your internet connection and try again in a few moments.',
 severity: 'warning',
 retryable: true
 };
 }

 // Timeout errors
 if (errorName === 'AbortError' || errorMsg.includes('timeout')) {
 return {
 userMessage: 'Request took too long to complete',
 technicalMessage: errorMsg,
 suggestedAction: 'The data service may be experiencing high load. Please try again.',
 severity: 'warning',
 retryable: true
 };
 }

 // API key and authentication errors
 if (errorMsg.includes('API key') || errorMsg.includes('401') || errorMsg.includes('403')) {
 return {
 userMessage: 'Authentication or access issue',
 technicalMessage: errorMsg,
 suggestedAction: 'Please contact support if this issue persists.',
 severity: 'error',
 retryable: false
 };
 }

 // Rate limiting
 if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
 return {
 userMessage: 'Request limit exceeded',
 technicalMessage: errorMsg,
 suggestedAction: 'Please wait a moment before making more requests.',
 severity: 'warning',
 retryable: true
 };
 }

 // Circuit breaker errors
 if (errorMsg.includes('Circuit breaker is OPEN')) {
 return {
 userMessage: 'Data service temporarily unavailable',
 technicalMessage: errorMsg,
 suggestedAction: 'The service is automatically being restored. Please try again in a few minutes.',
 severity: 'warning',
 retryable: true
 };
 }

 // Server errors (5xx)
 if (errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')) {
 return {
 userMessage: 'Data provider is experiencing issues',
 technicalMessage: errorMsg,
 suggestedAction: 'This is a temporary issue. Please try again in a few minutes.',
 severity: 'warning',
 retryable: true
 };
 }

 // No data found
 if (errorMsg.includes('No data') || errorMsg.includes('not found') || errorMsg.includes('404')) {
 return {
 userMessage: 'No data available for this request',
 technicalMessage: errorMsg,
 suggestedAction: 'Try adjusting your search criteria or check back later.',
 severity: 'info',
 retryable: false
 };
 }

 // Generic error fallback
 return {
 userMessage: 'An unexpected error occurred',
 technicalMessage: errorMsg,
 suggestedAction: 'Please try again. If the issue persists, contact support.',
 severity: 'error',
 retryable: true
 };
}

// Note: Fallback data functionality removed - APIs will return proper error responses only

// Display error in a user-friendly way
export function displayError(error: Error | string, context?: string): void {
 const friendlyError = createUserFriendlyError(error);
 
 console.group(` ${friendlyError.severity.toUpperCase()}: ${context || 'Error occurred'}`);
 console.warn(`User Message: ${friendlyError.userMessage}`);
 console.warn(`Suggested Action: ${friendlyError.suggestedAction}`);
 console.warn(`Retryable: ${friendlyError.retryable ? 'Yes' : 'No'}`);
 console.error(`Technical Details: ${friendlyError.technicalMessage}`);
 console.groupEnd();
}

// Create error response for API endpoints
export function createErrorResponse(error: Error | string, context?: string) {
 const friendlyError = createUserFriendlyError(error);
 
 return {
 success: false,
 error: friendlyError.userMessage,
 technical_error: friendlyError.technicalMessage,
 suggested_action: friendlyError.suggestedAction,
 retryable: friendlyError.retryable,
 severity: friendlyError.severity,
 context: context,
 timestamp: new Date().toISOString()
 };
}