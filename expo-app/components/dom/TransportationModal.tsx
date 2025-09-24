'use dom';

import React, { useState } from 'react';
import './transportation-modal.css';

interface TransportationModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromLocation: { id: string; name: string };
  toLocation: { id: string; name: string };
  existingTransportation?: {
    mode: string;
    duration: string;
    cost?: { amount: number; currency: string };
    notes?: string;
  };
  onSave: (transportation: {
    mode: string;
    duration: string;
    cost?: { amount: number; currency: string };
    notes?: string;
  }) => void;
}

const TRANSPORT_MODES = [
  { id: 'walking', name: 'Walking', icon: '🚶', color: '#10B981' },
  { id: 'metro', name: 'Metro', icon: '🚇', color: '#8B5CF6' },
  { id: 'bus', name: 'Bus', icon: '🚌', color: '#3B82F6' },
  { id: 'taxi', name: 'Taxi', icon: '🚕', color: '#F59E0B' },
  { id: 'bike', name: 'Bike', icon: '🚴', color: '#84CC16' },
  { id: 'car', name: 'Car', icon: '🚙', color: '#6B7280' },
];

export function TransportationModal({
  isOpen,
  onClose,
  fromLocation,
  toLocation,
  existingTransportation,
  onSave,
}: TransportationModalProps) {
  const [selectedMode, setSelectedMode] = useState('walking');
  const [duration, setDuration] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState('EUR');
  const [notes, setNotes] = useState('');

  // Load existing transportation data when modal opens
  React.useEffect(() => {
    if (isOpen && existingTransportation) {
      setSelectedMode(existingTransportation.mode || 'walking');
      setDuration(existingTransportation.duration || '');
      setCostAmount(existingTransportation.cost?.amount?.toString() || '');
      setCostCurrency(existingTransportation.cost?.currency || 'EUR');
      setNotes(existingTransportation.notes || '');
    } else if (isOpen && !existingTransportation) {
      // Reset to defaults when opening for new transportation
      setSelectedMode('walking');
      setDuration('');
      setCostAmount('');
      setCostCurrency('EUR');
      setNotes('');
    }
  }, [isOpen, existingTransportation]);

  if (!isOpen) return null;

  const handleSave = () => {
    const transportation: any = {
      mode: selectedMode,
      duration: duration || '15 min',
    };

    if (costAmount) {
      transportation.cost = {
        amount: parseFloat(costAmount),
        currency: costCurrency,
      };
    }

    if (notes) {
      transportation.notes = notes;
    }

    onSave(transportation);
    // Don't reset form here - let useEffect handle it when modal reopens
  };

  return (
    <div className="transport-modal-overlay" onClick={onClose}>
      <div className="transport-modal" onClick={(e) => e.stopPropagation()}>
        <div className="transport-modal-header">
          <h3>Add Transportation</h3>
          <button className="transport-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="transport-modal-route">
          <div className="transport-route-item">
            <span className="transport-route-label">From:</span>
            <span className="transport-route-name">{fromLocation.name}</span>
          </div>
          <div className="transport-route-arrow">→</div>
          <div className="transport-route-item">
            <span className="transport-route-label">To:</span>
            <span className="transport-route-name">{toLocation.name}</span>
          </div>
        </div>

        <div className="transport-modal-body">
          <div className="transport-form-group">
            <label>Transportation Mode</label>
            <div className="transport-mode-grid">
              {TRANSPORT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  className={`transport-mode-button ${
                    selectedMode === mode.id ? 'active' : ''
                  }`}
                  onClick={() => setSelectedMode(mode.id)}
                  style={{
                    borderColor: selectedMode === mode.id ? mode.color : 'transparent',
                    backgroundColor: selectedMode === mode.id ? `${mode.color}10` : 'transparent',
                  }}
                >
                  <span className="transport-mode-icon">{mode.icon}</span>
                  <span className="transport-mode-name">{mode.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="transport-form-group">
            <label htmlFor="duration">Duration</label>
            <input
              id="duration"
              type="text"
              className="transport-input"
              placeholder="e.g., 15 min, 1 hour"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          <div className="transport-form-group">
            <label htmlFor="cost">Cost (optional)</label>
            <div className="transport-cost-inputs">
              <input
                id="cost"
                type="number"
                className="transport-input transport-cost-amount"
                placeholder="0.00"
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
              />
              <select
                className="transport-input transport-cost-currency"
                value={costCurrency}
                onChange={(e) => setCostCurrency(e.target.value)}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="DKK">DKK</option>
              </select>
            </div>
          </div>

          <div className="transport-form-group">
            <label htmlFor="notes">Notes (optional)</label>
            <textarea
              id="notes"
              className="transport-input transport-notes"
              placeholder="e.g., Buy tickets at station, Line 2 towards..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="transport-modal-footer">
          <button className="transport-button transport-button-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="transport-button transport-button-save"
            onClick={handleSave}
            disabled={!duration && !selectedMode}
          >
            Add Transportation
          </button>
        </div>
      </div>
    </div>
  );
}