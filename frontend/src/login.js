import React, { useState } from 'react';
import axios from 'axios';
import './Login.css'; 

function Login({ setToken, setRole }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); 
    try {
      const response = await axios.post('/api/login', {
        username,
        password
      });
      const token = response.data.access_token;
      const role = response.data.role || 'admin';
      localStorage.setItem('role', role);
      setRole(role);
      setToken(token);
    } catch (err) {
      console.error("Login error", err);
      setError("Invalid username or password");
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">♻️</div>
          <h2 className="login-title">Smart Waste Management System</h2>
          <p className="login-subtitle">Please sign in to continue</p>
        </div>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Username:</label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password:</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="login-button">Login</button>
        </form>
      </div>
    </div>
  );
}

export default Login;
