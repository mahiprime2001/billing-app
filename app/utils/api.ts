import axios, { InternalAxiosRequestConfig, AxiosError } from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('sessionToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token.replace('session_', '')}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

export default api;
