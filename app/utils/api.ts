import axios, { InternalAxiosRequestConfig, AxiosError } from 'axios';
import Router from 'next/router'; // Import Router for programmatic navigation

const api = axios.create({
  baseURL: 'http://localhost:8080', // Hardcoded backend API URL
  withCredentials: true, // Crucial for sending HttpOnly cookies with cross-origin requests
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response && error.response.status === 401) {
      // Redirect to login page if 401 Unauthorized
      console.log('401 Unauthorized: Redirecting to login page.');
      // Clear any stored client-side user data
      localStorage.removeItem('adminLoggedIn');
      localStorage.removeItem('adminUser');
      // Force a full page reload to the login page
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
