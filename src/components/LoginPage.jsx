import React, { useState } from 'react';
import './AuthForm.css'; // Import the shared styles

function AuthPage({ onLoginSuccess }) {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState(''); // For displaying success/error messages

  const clearForm = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    // Not clearing message immediately on toggle, but on new submit attempt
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage(''); // Clear previous messages

    if (!isLoginMode && password !== confirmPassword) {
      setMessage("Passwords don't match!");
      return;
    }

    const endpoint = isLoginMode ? '/api/login/' : '/api/register/';
    const payload = isLoginMode 
      ? { email, password } // For login, 'email' field can be username or email
      : { username, email, password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        if (isLoginMode) {
          setMessage(`Login successful! Welcome ${data.user.username}`);
          onLoginSuccess(data.user); // Callback for App.jsx to update auth state
        } else {
          setMessage(data.message || 'Signup successful! Please log in.');
          setIsLoginMode(true); // Switch to login mode after successful signup
          clearForm(); // Clear form for login
        }
      } else {
        setMessage(data.error || (isLoginMode ? 'Login failed.' : 'Signup failed.'));
      }
    } catch (error) {
      console.error(isLoginMode ? 'Login error:' : 'Signup error:', error);
      setMessage('An error occurred. Please try again.');
    }
  };

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setMessage('');
    clearForm();
  };

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2>{isLoginMode ? 'Login' : 'Sign Up'}</h2>
        {message && <p style={{ color: message.includes('failed') || message.startsWith('Passwords') || message.startsWith('An error') ? 'red' : 'green' }}>{message}</p>}
        
        {!isLoginMode && (
          <div>
            <label htmlFor="username">Username:</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
        )}
        
        <div>
          <label htmlFor="email">{isLoginMode ? 'Email or Username:' : 'Email:'}</label>
          <input
            type={isLoginMode ? 'text' : 'email'} // Use text for login to allow username
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        
        <div>
          <label htmlFor="password">Password:</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {!isLoginMode && (
          <div>
            <label htmlFor="confirmPassword">Confirm Password:</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
        )}
        
        <button type="submit">{isLoginMode ? 'Login' : 'Sign Up'}</button>
        
        <p>
          {isLoginMode ? "Don't have an account? " : "Already have an account? "}
          <a href="#" onClick={toggleMode} style={{cursor: 'pointer'}}>
            {isLoginMode ? 'Sign Up' : 'Login'}
          </a>
        </p>
      </form>
    </div>
  );
}

export default AuthPage; 