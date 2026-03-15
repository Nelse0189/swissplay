import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import './CustomDropdown.css';

const CustomDropdown = ({ options, value, onChange, placeholder = "Select...", disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [listStyle, setListStyle] = useState({});
  const dropdownRef = useRef(null);
  const listRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value);

  const updateListPosition = () => {
    if (dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      setListStyle({
        position: 'fixed',
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
        minWidth: rect.width,
      });
    }
  };

  useLayoutEffect(() => {
    if (isOpen && dropdownRef.current) {
      updateListPosition();
      const handleResize = () => updateListPosition();
      const handleScroll = () => updateListPosition();
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          listRef.current && !listRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (optionValue) => {
    if (!disabled) {
      onChange(optionValue);
      setIsOpen(false);
    }
  };

  const dropdownList = isOpen && !disabled ? (
    <div
      ref={listRef}
      className="dropdown-list dropdown-list-portal"
      style={listStyle}
    >
      {options.length > 0 ? (
        options.map((option) => (
          <div
            key={option.value}
            className={`dropdown-item ${value === option.value ? 'selected' : ''}`}
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </div>
        ))
      ) : (
        <div className="dropdown-item empty">No options available</div>
      )}
    </div>
  ) : null;

  return (
    <>
      <div className={`custom-dropdown ${disabled ? 'disabled' : ''}`} ref={dropdownRef}>
        <div
          className={`dropdown-header ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          <span className="selected-value">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <span className="dropdown-arrow">▼</span>
        </div>
      </div>
      {dropdownList && createPortal(dropdownList, document.body)}
    </>
  );
};

export default CustomDropdown;
