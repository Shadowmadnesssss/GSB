import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import BillModal from '../components/BillModal';
import AddBillModal from '../components/AddBillModal';
import BillsStatsChart from '../components/BillsStatsChart';
import { removeToken } from '../auth';
import { API_URL } from '../config';

const STATUS_OPTIONS = ["Pending", "Approved", "Rejected"];

export default function Dashboard() {
  const [bills, setBills] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const token = localStorage.getItem('token') || '';
  const user = JSON.parse(localStorage.getItem('user'));
  const userId = user?._id;
  const userRole = user?.role;
  const navigate = useNavigate();
  const [selectedBills, setSelectedBills] = useState([]);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState(STATUS_OPTIONS[0]);

  useEffect(() => {
    (async () => {
      try {
        // Fetch bills
        const billsResponse = await fetch(`${API_URL}/bills`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        if (billsResponse.status === 401) {
          removeToken();
          localStorage.removeItem('user');
          navigate('/login');
          return;
        }
        const billsData = await billsResponse.json();
        setBills(billsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    })();
  }, [token, navigate, userRole]);

  // Ensure proper modal cleanup when component unmounts
  useEffect(() => {
    return () => {
      // Ensure body scroll is enabled when component unmounts
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleAddBill = (newBill) => {
    setBills([newBill, ...bills]);
  };

  const handleUpdateBill = (updatedBill, deletedId) => {
    if (deletedId) {
      setBills(bills.filter(bill => bill._id !== deletedId));
    } else if (updatedBill) {
      setBills(bills.map(bill => 
        bill._id === updatedBill._id ? updatedBill : bill
      ));
    }
  };

  const handleViewBill = (bill) => {
    setSelectedBill(bill);
    setIsDetailModalOpen(true);
  };

  // Function to determine status badge color
  const getStatusClasses = (status) => {
    switch (status) {
      case 'Approved':
        return 'bg-green-100 text-green-800 border border-green-400';
      case 'Rejected':
        return 'bg-red-100 text-red-800 border border-red-400';
      case 'Pending':
      default:
        return 'bg-blue-100 text-blue-800 border border-blue-400';
    }
  };

  // Format date to more readable format
  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  // Filter bills by user (except admin)
  const filteredBills = bills?.filter(bill => {
    // Filter by status
    if (filterStatus !== 'All' && bill.status !== filterStatus) {
      return false;
    }
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (userRole === 'admin') {
        return (
          bill.merchant?.toLowerCase().includes(query) ||
          bill.description?.toLowerCase().includes(query) ||
          bill.amount?.toString().includes(query) ||
          bill.type?.toLowerCase().includes(query) ||
          bill.user?.name?.toLowerCase().includes(query) ||
          bill.user?.email?.toLowerCase().includes(query)
        );
      } else {
        return (
          bill.merchant?.toLowerCase().includes(query) ||
          bill.description?.toLowerCase().includes(query) ||
          bill.amount?.toString().includes(query) ||
          bill.type?.toLowerCase().includes(query)
        );
      }
    }
    return true;
  }) || [];

  const handleRowClick = (bill) => {

    setSelectedBill({ ...bill });
    setTimeout(() => {
      setIsDetailModalOpen(true);
    }, 0);
  };

  const openAddBillModal = () => {

    setIsAddModalOpen(true);
  };

  const closeDetailModal = () => {

    setIsDetailModalOpen(false);
    setTimeout(() => {
      setSelectedBill(null);
    }, 300);
  };

  const closeAddModal = () => {

    setIsAddModalOpen(false);
  };

  const handleLogout = () => {
    removeToken();
    localStorage.removeItem('user');
    navigate('/login');
  };



  // Individual selection
  const handleSelectBill = (billId) => {
    setSelectedBills((prev) =>
      prev.includes(billId) ? prev.filter((id) => id !== billId) : [...prev, billId]
    );
  };
  // Select/unselect all
  const handleSelectAll = () => {
    if (selectedBills.length === filteredBills.length) {
      setSelectedBills([]);
    } else {
      setSelectedBills(filteredBills.map((bill) => bill._id));
    }
  };
  // Open status change modal
  const openStatusModal = () => setIsStatusModalOpen(true);
  const closeStatusModal = () => setIsStatusModalOpen(false);

  // Group status change
  const handleChangeStatus = async () => {
    try {
      await Promise.all(selectedBills.map(async (billId) => {
                  await fetch(`${API_URL}/bills/${billId}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: newStatus })
        });
      }));
      // Update locally
      setBills((prev) => prev.map((bill) =>
        selectedBills.includes(bill._id) ? { ...bill, status: newStatus } : bill
      ));
      setSelectedBills([]);
      closeStatusModal();
    } catch (e) {
      alert("Error updating status");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#101828] via-[#16213e] to-[#223047] text-white">
      <Header onLogout={handleLogout} customClass="bg-[#16213e] text-white shadow-lg" />
      
      <main className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header Section */}
          <div className="mb-6 md:flex md:items-center md:justify-between bg-[#16213e]/90 rounded-xl px-8 py-6 shadow-lg">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-7 text-white sm:truncate">
                Your Bills
              </h2>
            </div>
            <div className="mt-4 flex md:ml-4 md:mt-0 space-x-2">
              {userRole === 'admin' && (
                <>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="inline-flex items-center rounded-md bg-[#223047] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#223047]/80"
                  >
                    {selectedBills.length === filteredBills.length ? 'Deselect all' : 'Select all'}
                  </button>
                  <button
                    type="button"
                    onClick={openStatusModal}
                    className="inline-flex items-center rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-50"
                    disabled={selectedBills.length === 0}
                  >
                    Change status
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={openAddBillModal}
                className="ml-3 inline-flex items-center rounded-md bg-[#223047] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#223047]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#223047]"
              >
                <svg className="-ml-0.5 mr-1.5 h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                </svg>
                Add Bill
              </button>
            </div>
          </div>
          
          {/* Filters */}
          <div className="mb-6 grid grid-cols-1 gap-y-4 md:grid-cols-3 md:gap-x-4">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <input
                type="text"
                className="block w-full rounded-md border border-[#223047] bg-[#223047] text-white py-2 pl-10 pr-3 text-sm placeholder-gray-400 focus:border-[#223047] focus:outline-none focus:ring-1 focus:ring-[#223047]"
                placeholder={userRole === 'admin' ? "Search by user, type, description, amount..." : "Search by type, description, amount..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="md:col-span-2 md:flex md:items-center md:justify-end space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-200">Status:</span>
                <select
                  className="rounded-md border border-[#223047] bg-[#223047] text-white py-2 pl-3 pr-10 text-sm focus:border-[#223047] focus:outline-none focus:ring-1 focus:ring-[#223047]"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="All">All</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Statistics Charts */}
          <div className="mb-8">
            <BillsStatsChart bills={bills} />
          </div>
          
          {/* Bills Table */}
          {filteredBills.length === 0 ? (
            <div className="mt-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No bills found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery || filterStatus !== 'All'
                  ? "Try adjusting your search or filter to find what you're looking for."
                  : 'Get started by creating a new bill.'}
              </p>
              {!searchQuery && filterStatus === 'All' && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={openAddBillModal}
                    className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                  >
                    <svg className="-ml-0.5 mr-1.5 h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                    </svg>
                    Add Bill
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center">
              <div className="w-full max-w-5xl">
                <div className="overflow-hidden shadow-2xl rounded-2xl bg-[#16213e]/95">
                  <table className="min-w-full divide-y divide-[#223047]">
                    <thead className="bg-[#223047]">
                        <tr>
                        {userRole === 'admin' && (
                          <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">
                            <input
                              type="checkbox"
                              checked={selectedBills.length === filteredBills.length && filteredBills.length > 0}
                              onChange={handleSelectAll}
                            />
                          </th>
                        )}
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">
                            ID
                          </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                            Date
                          </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                            Type
                          </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                          User
                        </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                            Amount
                          </th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">
                            Status
                          </th>
                          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                    <tbody className="divide-y divide-[#223047]">
                        {filteredBills.map((bill) => (
                          <tr 
                            key={bill._id} 
                          className="hover:bg-[#223047]/80 cursor-pointer"
                            onClick={() => handleRowClick(bill)}
                          >
                            {userRole === 'admin' && (
                              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">
                                <input
                                  type="checkbox"
                                  checked={selectedBills.includes(bill._id)}
                                  onChange={e => {
                                    e.stopPropagation();
                                    handleSelectBill(bill._id);
                                  }}
                                  onClick={e => e.stopPropagation()}
                                />
                              </td>
                            )}
                            <td 
                            className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6"
                            >
                              #{bill._id}
                            </td>
                            <td 
                            className="whitespace-nowrap px-3 py-4 text-sm text-gray-200"
                            >
                              {formatDate(bill.date)}
                            </td>
                            <td 
                            className="whitespace-nowrap px-3 py-4 text-sm text-gray-200"
                            >
                              {bill.type}
                            </td>
                            <td 
                            className="whitespace-nowrap px-3 py-4 text-sm text-gray-200"
                          >
                            {bill.user?.name || bill.user?.email || '—'}
                          </td>
                          <td 
                            className="whitespace-nowrap px-3 py-4 text-sm text-white font-medium"
                            >
                              ${bill.amount.toFixed(2)}
                            </td>
                            <td 
                              className="whitespace-nowrap px-3 py-4 text-sm"
                            >
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusClasses(bill.status)}`}>
                                {bill.status}
                              </span>
                            </td>
                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                              <button 
                              className="text-blue-400 hover:text-blue-200"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewBill(bill);
                                }}
                              >
                                View<span className="sr-only">, bill #{bill.id}</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between border-t border-[#223047] bg-[#16213e]/95 px-4 py-3 sm:px-6 rounded-b-2xl w-full max-w-5xl">
                <div className="flex flex-1 justify-between sm:hidden">
                  <button className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Previous
                  </button>
                  <button className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing <span className="font-medium">1</span> to <span className="font-medium">{filteredBills.length}</span> of{' '}
                      <span className="font-medium">{filteredBills.length}</span> results
                    </p>
                  </div>
                  <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                      <button className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0">
                        <span className="sr-only">Previous</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 bg-blue-50">
                        1
                      </button>
                      <button className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0">
                        <span className="sr-only">Next</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      
      {/* Bill Detail Modal */}
      <BillModal
        bill={selectedBill}
        isOpen={isDetailModalOpen}
        onClose={closeDetailModal}
        onUpdate={handleUpdateBill}
      />
      
      {/* Add Bill Modal */}
      <AddBillModal
        isOpen={isAddModalOpen}
        onClose={closeAddModal}
        onSave={handleAddBill}
      />

      {/* Status change modal */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-[#16213e] rounded-xl p-8 w-full max-w-xs shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-white">Change status of {selectedBills.length} bill(s)</h2>
            <select
              className="w-full rounded p-2 bg-[#223047] text-white border border-[#223047] mb-4"
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded bg-gray-600 text-white hover:bg-gray-700"
                onClick={closeStatusModal}
              >Cancel</button>
              <button
                className="px-4 py-2 rounded bg-green-700 text-white hover:bg-green-800"
                onClick={handleChangeStatus}
              >Validate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 