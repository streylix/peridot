import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Search } from 'lucide-react';

function GifModal({ isOpen, onClose, onConfirm }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [gifs, setGifs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const GIPHY_API_KEY = 'GkVHnnWLvZCSOlLfkGF1vyBilm4h4iCS';

  const searchGifs = async (query) => {
    if (!query) {
      setGifs([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${query}&limit=20&offset=0&rating=g&lang=en&bundle=messaging_non_clips`
      );
      const data = await response.json();
      setGifs(data.data);
    } catch (error) {
      console.error('Error fetching GIFs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      searchGifs(searchTerm);
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleGifSelect = (gif) => {
    onConfirm(gif.images.fixed_height.url);
    onClose();
    setSearchTerm('');
  };

  const sections = [{
    items: [{
      content: (
        <div className="gif-search-container">
          <div className="gif-search-header">
            <span className="gif-header-title">Add GIF</span>
            <div className="search-input-wrapper">
              <Search className="search-icon" size={18} />
              <input
                type="text"
                placeholder="Search GIFs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="gif-search-input"
                autoFocus
              />
            </div>
          </div>
          <div className="gif-grid">
            {isLoading ? (
              <div className="gif-loading">Loading...</div>
            ) : (
              gifs.map((gif) => (
                <div
                  key={gif.id}
                  className="gif-item"
                  onClick={() => handleGifSelect(gif)}
                >
                  <img
                    src={gif.images.fixed_height.url}
                    alt={gif.title}
                    loading="lazy"
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )
    }]
  }];

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setSearchTerm('');
      }}
      title=""
      sections={sections}
      size="large"
      className="gif-modal"
    />
  );
}

export default GifModal;