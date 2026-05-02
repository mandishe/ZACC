import { User, UserRole } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class ApiClient {
  private get token(): string | null {
    return localStorage.getItem('nexus_token');
  }

  private set token(value: string | null) {
    if (value) {
      localStorage.setItem('nexus_token', value);
    } else {
      localStorage.removeItem('nexus_token');
    }
  }

  private async request(endpoint: string, method: string = 'GET', body: any = null) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config: RequestInit = {
      method,
      headers,
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`${API_URL}${endpoint}`, config);
      
      if (!response.ok) {
        if (response.status === 401) {
          this.token = null;
          localStorage.removeItem('nexus_user');
          window.location.reload();
        }

        const error = await response.json();
        let message = error.message || 'Request failed';

        // Surface validation messages from Laravel (422 responses)
        if (response.status === 422 && error.errors) {
          const firstField = Object.keys(error.errors)[0];
          const fieldErrors = firstField ? error.errors[firstField] : null;

          if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
            message = fieldErrors[0];
          }
        }

        throw new Error(message);
      }

      return await response.json();
    } catch (error: any) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }

  async login(email: string, password: string) {
    const data = await this.request('/auth/login', 'POST', { email, password });
    this.token = data.token;
    
    // Map backend user to frontend User interface
    const user: User = {
      id: data.user.id.toString(),
      nexusKey: data.user.email,
      role: data.user.role as UserRole,
      isStealth: false
    };
    
    return { user, token: data.token };
  }

  async register(name: string, email: string, password: string, password_confirmation: string) {
    const data = await this.request('/auth/register', 'POST', { 
      name, 
      email, 
      password, 
      password_confirmation 
    });
    this.token = data.token;
    
    const user: User = {
      id: data.user.id.toString(),
      nexusKey: data.user.email,
      role: data.user.role as UserRole,
      isStealth: false
    };
    
    return { user, token: data.token };
  }

  async getUser(): Promise<User> {
    const data = await this.request('/auth/user');
    return {
      id: data.id.toString(),
      nexusKey: data.email,
      role: data.role as UserRole,
      isStealth: false
    };
  }

  async getReports() {
    return this.request('/reports');
  }

  async createReport(data: any) {
    return this.request('/reports', 'POST', data);
  }

  async createAnonymousReport(data: any) {
    return this.request('/reports/anonymous', 'POST', data);
  }

  async trackCase(trackingCode: string) {
    return this.request(`/reports/track/${encodeURIComponent(trackingCode)}`);
  }

  async getPublicStats() {
    return this.request('/stats/public');
  }

  async getCases() {
    return this.request('/cases');
  }

  async getUsers() {
    return this.request('/users');
  }

  async createUser(data: any) {
    return this.request('/users', 'POST', data);
  }

  async updateUser(id: string, data: any) {
    return this.request(`/users/${id}`, 'PUT', data);
  }

  async deleteUser(id: string) {
    return this.request(`/users/${id}`, 'DELETE');
  }

  async resetUserPassword(id: string) {
    return this.request(`/users/${id}/reset-password`, 'POST');
  }

  async toggleUserActive(id: string) {
    return this.request(`/users/${id}/toggle-active`, 'POST');
  }

  async disputeReport(caseId: string, reason: string) {
    return this.request(`/reports/${caseId}/dispute`, 'POST', { reason });
  }

  async uploadEvidence(trackingCode: string, files: File[]) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files[]', file));
    return this.requestFormData(`/reports/evidence/${encodeURIComponent(trackingCode)}`, formData);
  }

  async publicDispute(trackingCode: string, reason: string, files: File[] = []) {
    const formData = new FormData();
    formData.append('reason', reason);
    files.forEach((file) => formData.append('evidence[]', file));
    return this.requestFormData(`/reports/dispute/${encodeURIComponent(trackingCode)}`, formData);
  }

  private async requestFormData(endpoint: string, formData: FormData) {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    try {
      const response = await fetch(`${API_URL}${endpoint}`, { method: 'POST', headers, body: formData });
      if (!response.ok) {
        let message = 'Upload failed';
        try {
          const error = await response.json();
          message = error.message || message;

          // Surface Laravel validation messages when available.
          if (response.status === 422 && error.errors) {
            const firstField = Object.keys(error.errors)[0];
            const fieldErrors = firstField ? error.errors[firstField] : null;
            if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
              message = fieldErrors[0];
            }
          }
        } catch {
          const text = await response.text().catch(() => '');
          if (text) message = text.slice(0, 200);
        }
        throw new Error(message);
      }
      return await response.json();
    } catch (error: any) {
      console.error(`API FormData Error (${endpoint}):`, error);
      throw error;
    }
  }

  async verifyReport(reportId: string) {
    return this.request(`/reports/${reportId}/verify`, 'GET');
  }

  async createStageEvaluation(reportId: string, data: any) {
    return this.request(`/reports/${reportId}/stages`, 'POST', data);
  }

  async getStageEvaluations(reportId: string) {
    return this.request(`/reports/${reportId}/stages`);
  }

  async getNotifications() {
    return this.request('/notifications');
  }

  async getAuditLogs() {
    return this.request('/audit/logs');
  }

  async chatbotMessage(message: string, history: { role: 'user' | 'bot'; text: string }[] = []) {
    return this.request('/chatbot', 'POST', { message, history });
  }

  async getReportSummary(filters: Record<string, string> = {}) {
    const params = new URLSearchParams(filters).toString();
    return this.request(`/reports/generate/summary${params ? '?' + params : ''}`);
  }

  async exportReports(category: string, filters: Record<string, string> = {}) {
    const params = new URLSearchParams({ category, ...filters }).toString();
    return this.request(`/reports/generate/export?${params}`);
  }

  async getHotspots() {
    return this.request('/hotspots');
  }

  async getTypeCorrectionAudit(limit: number = 50) {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit || 50)));
    return this.request(`/reports/type-correction-audit?limit=${safeLimit}`);
  }

  async getPublicHotspots() {
    return this.request('/hotspots/public');
  }

  async logout() {
    await this.request('/auth/logout', 'POST');
    this.token = null;
  }

  async get(endpoint: string) {
    return this.request(endpoint);
  }

  async post(endpoint: string, data: any) {
    return this.request(endpoint, 'POST', data);
  }

  async put(endpoint: string, data: any) {
    return this.request(endpoint, 'PUT', data);
  }

  async delete(endpoint: string) {
    return this.request(endpoint, 'DELETE');
  }

  // AI Expert System methods
  async expertCaseReview(caseId: string) {
    return this.request(`/ai/expert-review/${caseId}`);
  }

  async scanEvidence(caseId: string) {
    return this.request(`/ai/scan-evidence/${caseId}`);
  }

  async preReviewAnalysis(caseId: string) {
    return this.request(`/ai/pre-review-analysis/${caseId}`);
  }

  async preSubmissionSuggestions(data: { type: string; description: string; institution?: string; location?: string }) {
    // Use authenticated route if token exists, otherwise public route
    const endpoint = this.token ? '/ai/pre-submission-suggestions' : '/ai/pre-submission-suggestions-public';
    return this.request(endpoint, 'POST', data);
  }

  async validateTextClarity(text: string, language: string = 'en') {
    return this.request('/ai/validate-text', 'POST', { text, language });
  }

  async translateText(text: string, fromLanguage: string, toLanguage: string) {
    return this.request('/ai/translate', 'POST', {
      text,
      from_language: fromLanguage,
      to_language: toLanguage,
    });
  }
}

export const apiClient = new ApiClient();

// frontend/services/api.ts

// ... existing code ...

export const submitReport = async (description: string, files: File[]) => {
  // 1. Create a new FormData object
  const formData = new FormData();
  
  // 2. Append the text description
  formData.append('description', description);
  
  // 3. Append each file. Notice the 'files[]' syntax - this tells Laravel to expect an array of files.
  files.forEach((file) => {
    formData.append('files[]', file);
  });

  // 4. Send the POST request
  // Note: We deliberately DO NOT set the 'Content-Type' header here. 
  // The browser automatically sets it to 'multipart/form-data' with the correct boundary when it sees a FormData object.
  const response = await fetch(`${import.meta.env.VITE_API_URL}/reports`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.message || 'Failed to submit the secure report.');
  }

  return response.json();
};

export const fetchReports = async () => {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/reports`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch reports from the server.');
  }

  return response.json();
};

export const fetchReportDetails = async (id: number | string) => {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/reports/${id}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch case details.');
  }

  return response.json();
};