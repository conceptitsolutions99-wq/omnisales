import React, { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  DollarSign,
  Calendar,
  PhoneCall,
  Building2,
  Plus,
  UserCheck,
  AlertCircle,
  Shield
} from 'lucide-react';

export default function FollowUps({ followups, setFollowups, leads, currentUser }) {
  const [filterStatus, setFilterStatus] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFollowup, setNewFollowup] = useState({
    leadId: leads[0]?.id || 1,
    type: 'Payment Transfer',
    status: 'Pending Transfer',
    scheduledDate: new Date().toISOString().replace('T', ' ').substring(0, 16),
    assignedTo: currentUser.name,
    notes: 'Awaiting wire transfer confirmation from client accounting.'
  });

  const handleStatusChange = (id, newStatus) => {
    const updated = followups.map(f => {
      if (f.id === id) {
        return { ...f, status: newStatus };
      }
      return f;
    });
    setFollowups(updated);
  };

  const handleAddFollowup = (e) => {
    e.preventDefault();
    const selectedLead = leads.find(l => l.id === Number(newFollowup.leadId));
    if (!selectedLead) return;

    const followupToAdd = {
      id: Date.now(),
      leadId: selectedLead.id,
      leadName: selectedLead.name,
      company: selectedLead.company,
      phone: selectedLead.displayPhone || selectedLead.phone,
      value: selectedLead.value,
      ...newFollowup,
      assignedTo: currentUser.name
    };

    setFollowups([followupToAdd, ...followups]);
    setIsModalOpen(false);
  };

  // Role-based filtering: Admin sees all, employees see only their own assigned follow-ups
  const filteredFollowups = followups.filter(f => {
    const isAdmin = currentUser.role === 'Admin' || currentUser.permissions.admin;
    const isAssignedToUser = f.assignedTo === currentUser.name;
    const matchesPermission = isAdmin || isAssignedToUser;
    const matchesStatus = filterStatus === 'All' || f.status === filterStatus;

    return matchesPermission && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center">
            <Clock className="w-7 h-7 mr-2 text-amber-600" />
            Customer Follow-up Queue ({currentUser.role === 'Admin' ? 'All Company Tasks' : 'My Assigned Tasks'})
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {currentUser.role === 'Admin'
              ? 'Admin View: Viewing all company follow-ups, pending wire transfers, and scheduled callbacks across all agents.'
              : `Personal View: Showing follow-ups assigned specifically to ${currentUser.name}.`}
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl shadow-md transition-all flex items-center space-x-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Schedule Follow-up</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Tasks ({filteredFollowups.length})
        </span>
        <div className="flex items-center space-x-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="py-1.5 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs dark:text-white"
          >
            <option value="All">All Statuses</option>
            <option value="Pending Transfer">Pending Transfer</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Follow-ups List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredFollowups.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            No follow-up tasks found assigned to you.
          </div>
        ) : (
          filteredFollowups.map((item) => (
            <div
              key={item.id}
              className={`bg-white dark:bg-slate-900 p-6 rounded-2xl border shadow-sm flex flex-col justify-between space-y-4 ${
                item.status === 'Pending Transfer'
                  ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    item.status === 'Pending Transfer' ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' :
                    item.status === 'Completed' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' :
                    'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  }`}>
                    {item.status}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                    ${item.value?.toLocaleString()}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">{item.leadName}</h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center mt-0.5">
                    <Building2 className="w-3.5 h-3.5 mr-1 text-slate-400" /> {item.company}
                  </div>
                </div>

                <div className="text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Task Type:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{item.type}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Scheduled:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">{item.scheduledDate}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Assigned Agent:</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">{item.assignedTo}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 italic">
                  "{item.notes}"
                </p>
              </div>

              {/* Status Action Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <select
                  value={item.status}
                  onChange={(e) => handleStatusChange(item.id, e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="Pending Transfer">Pending Transfer</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Completed">Completed Transfer / Task</option>
                </select>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Followup Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-amber-600 to-orange-600 text-white">
              <h3 className="text-lg font-bold">Schedule Customer Follow-up</h3>
              <p className="text-xs text-amber-100 mt-0.5">Assign callback or money transfer task</p>
            </div>

            <form onSubmit={handleAddFollowup} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Select Lead *</label>
                <select
                  value={newFollowup.leadId}
                  onChange={(e) => setNewFollowup({...newFollowup, leadId: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white"
                >
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>{lead.name} — {lead.company}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Task Type</label>
                  <select
                    value={newFollowup.type}
                    onChange={(e) => setNewFollowup({...newFollowup, type: e.target.value})}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white"
                  >
                    <option value="Payment Transfer">Payment Transfer</option>
                    <option value="Call Back">Call Back</option>
                    <option value="Quote Review">Quote Review</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Initial Status</label>
                  <select
                    value={newFollowup.status}
                    onChange={(e) => setNewFollowup({...newFollowup, status: e.target.value})}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white"
                  >
                    <option value="Pending Transfer">Pending Transfer</option>
                    <option value="Scheduled">Scheduled</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Scheduled Date & Time</label>
                <input
                  type="datetime-local"
                  value={newFollowup.scheduledDate}
                  onChange={(e) => setNewFollowup({...newFollowup, scheduledDate: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Follow-up Notes</label>
                <textarea
                  rows="3"
                  value={newFollowup.notes}
                  onChange={(e) => setNewFollowup({...newFollowup, notes: e.target.value})}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white resize-none"
                ></textarea>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium shadow-md"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
