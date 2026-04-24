import React from 'react';
import { EnrichedLead } from '../types';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Copy, Mail, Phone, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LeadTableProps {
  leads: EnrichedLead[];
}

export const LeadTable: React.FC<LeadTableProps> = ({ leads }) => {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-bottom border-gray-200">
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lead</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Confidence</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((lead) => (
              <React.Fragment key={lead.lead_id}>
                <tr 
                  className={`group hover:bg-gray-50 transition-colors cursor-pointer ${expandedId === lead.lead_id ? 'bg-blue-50/30' : ''}`}
                  onClick={() => setExpandedId(expandedId === lead.lead_id ? null : lead.lead_id)}
                >
                  <td className="px-6 py-4">
                    {lead.sendable ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 size={16} />
                        <span className="text-sm font-medium">Sendable</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-600">
                        <AlertCircle size={16} />
                        <span className="text-sm font-medium">Skipped</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900">{lead.email}</span>
                      <span className="text-xs text-gray-500">ID: {lead.lead_id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-700">{lead.business_category}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${lead.category_confidence > 0.7 ? 'bg-green-500' : lead.category_confidence > 0.4 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${lead.category_confidence * 100}%` }}
                          />
                       </div>
                       <span className="text-xs text-gray-500">{(lead.category_confidence * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {expandedId === lead.lead_id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </td>
                </tr>
                <AnimatePresence>
                  {expandedId === lead.lead_id && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 py-6 border-t border-gray-100 bg-gray-50/50 space-y-6">
                            {lead.skip_reason && (
                              <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-amber-800 text-sm flex gap-2">
                                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold">Reason for skipping:</span> {lead.skip_reason}
                                </div>
                              </div>
                            )}

                            {lead.needs_review && (
                              <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-blue-800 text-sm flex gap-2">
                                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold">Needs Review:</span> Some information might be generic or category confidence is low.
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                              <div className="space-y-4 col-span-1">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Details</h4>
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Phone size={14} />
                                    <span>{lead.phone_number}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Mail size={14} />
                                    <span>{lead.email}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-4 col-span-2">
                                <div className="flex justify-between items-end">
                                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Draft Email</h4>
                                  <button 
                                    onClick={() => copyToClipboard(lead.message)}
                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                  >
                                    <Copy size={12} />
                                    Copy Message
                                  </button>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600">
                                    Subject: {lead.subject}
                                  </div>
                                  <div className="p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                                    {lead.message}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </AnimatePresence>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
