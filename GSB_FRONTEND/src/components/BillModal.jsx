import { useState, useEffect } from 'react';
import { api } from '../api';

export default function BillModal({ bill, isOpen, onClose, onUpdate }) {
  const [editedBill, setEditedBill] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [proofUrl, setProofUrl] = useState(null);
  const user = JSON.parse(localStorage.getItem('user'));
  const isAdmin = user?.role === 'admin';
  
  // Clean version - no debug elements

  useEffect(() => {
    if (bill) {
      setEditedBill(bill);
      setIsEditing(false);
    }
  }, [bill]);

  useEffect(() => {
    // Get proof URL - try public URL first, then signed URL if needed
    const fetchProofUrl = async () => {
      if (isOpen && bill && bill.proof) {
        // Si bill.proof est déjà une URL complète S3, l'utiliser directement
        if (bill.proof.startsWith('https://')) {
          setProofUrl(bill.proof);
          return;
        }
        
        // Sinon, récupérer l'URL signée via l'API
        if (bill._id) {
          try {
            const data = await api.get(`/bills/${bill._id}/proof-url`);
            // Décoder l'URL pour corriger les &amp; en &
            const decodedUrl = data.url.replace(/&amp;/g, '&');
            setProofUrl(decodedUrl);
          } catch (error) {
            // Fallback vers l'URL directe
            if (bill.proof) {
              setProofUrl(bill.proof);
            } else {
              setProofUrl(null);
            }
          }
        }
      } else {
        setProofUrl(null);
      }
    };
    fetchProofUrl();
  }, [isOpen, bill]);

  if (!isOpen || !editedBill) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedBill(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;

    try {
      const updatedBill = await api.put(`/bills/${editedBill._id}`, {
        date: editedBill.date,
        type: editedBill.type,
        merchant: editedBill.merchant,
        amount: parseFloat(editedBill.amount),
        description: editedBill.description,
        status: editedBill.status
      });
      setEditedBill(updatedBill);
      if (onUpdate) {
        onUpdate(updatedBill);
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating bill:', error);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin) return;
    if (!window.confirm('Are you sure you want to delete this expense note?')) return;
    try {
      await api.delete(`/bills/${editedBill._id}`);
      if (onUpdate) onUpdate(null, editedBill._id);
      onClose();
    } catch (error) {
      console.error('Error during deletion:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop avec blur et assombrissement */}
      <div className="fixed inset-0 backdrop-blur-sm bg-black/30 transition-opacity" aria-hidden="true" onClick={onClose}></div>
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 z-[101] relative">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-semibold">Bill Details</h2>
          <div className="flex items-center space-x-2">
            {isAdmin && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-blue-600 hover:text-blue-800 px-3 py-1 rounded-md border border-blue-600 hover:bg-blue-50"
              >
                {isEditing ? 'Cancel' : 'Edit'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">ID</label>
            <p className="mt-1 text-sm text-gray-900">#{editedBill._id}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            {isAdmin && isEditing ? (
              <input
                type="date"
                name="date"
                value={new Date(editedBill.date).toISOString().split('T')[0]}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
              />
            ) : (
              <p className="mt-1 text-sm text-gray-900">
                {new Date(editedBill.date).toLocaleDateString()}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            {isAdmin && isEditing ? (
              <input
                type="text"
                name="type"
                value={editedBill.type}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
              />
            ) : (
              <p className="mt-1 text-sm text-gray-900">{editedBill.type}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Merchant</label>
            {isAdmin && isEditing ? (
              <input
                type="text"
                name="merchant"
                value={editedBill.merchant}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
              />
            ) : (
              <p className="mt-1 text-sm text-gray-900">{editedBill.merchant}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Amount</label>
            {isAdmin && isEditing ? (
              <input
                type="number"
                step="0.01"
                name="amount"
                value={editedBill.amount}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
              />
            ) : (
              <p className="mt-1 text-sm text-gray-900">${editedBill.amount.toFixed(2)}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            {isAdmin && isEditing ? (
              <textarea
                name="description"
                value={editedBill.description}
                onChange={handleInputChange}
                rows="3"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
              />
            ) : (
              <p className="mt-1 text-sm text-gray-900">{editedBill.description}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            {isAdmin ? (
              <select
                name="status"
                value={editedBill.status}
                onChange={handleInputChange}
                disabled={!isEditing}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
              >
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            ) : (
              <p className="mt-1 text-sm text-gray-900">{editedBill.status}</p>
            )}
          </div>

          {proofUrl && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Proof</label>
              {proofUrl.endsWith('.pdf') ? (
                <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">View PDF proof</a>
              ) : (
                <img 
                  src={proofUrl} 
                  alt="Proof" 
                  className="mt-2 max-w-full max-h-64 rounded-lg border border-gray-200 shadow"
                />
              )}
            </div>
          )}
          
          {!proofUrl && bill?.proof && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Proof</label>
              <p className="text-sm text-gray-500 italic">Loading proof image...</p>
            </div>
          )}
          
          {!bill?.proof && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Proof</label>
              <p className="text-sm text-gray-500 italic">No proof available</p>
            </div>
          )}

          {isAdmin && isEditing && (
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          )}

          {isAdmin && !isEditing && (
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleDelete}
                className="bg-red-100 text-red-700 px-4 py-2 rounded-md hover:bg-red-200"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200"
              >
                Close
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
} 