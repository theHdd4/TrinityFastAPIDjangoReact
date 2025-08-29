import React, { useState, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Bot, User, X, MessageSquare, Send, Plus, RotateCcw } from 'lucide-react';
import { TRINITY_AI_API, CONCAT_API, MERGE_API, CREATECOLUMN_API, GROUPBY_API, FEATURE_OVERVIEW_API, VALIDATE_API, CHART_MAKER_API } from '@/lib/api';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface AtomAIChatBotProps {
  atomId: string;
  atomType: string;
  atomTitle: string;
  className?: string;
  disabled?: boolean;
}

const ENDPOINTS: Record<string, string> = {
  concat: `${TRINITY_AI_API}/concat`,
  merge: `${TRINITY_AI_API}/merge`,
  'chart-maker': `${TRINITY_AI_API}/chart-maker`,
  'create-column': `${TRINITY_AI_API}/create-transform`,
  'groupby-wtg-avg': `${TRINITY_AI_API}/groupby`,
};

const PERFORM_ENDPOINTS: Record<string, string> = {
  merge: `${MERGE_API}/perform`,
  concat: `${CONCAT_API}/perform`,
  'create-column': `${CREATECOLUMN_API}/perform`,
  'groupby-wtg-avg': `${GROUPBY_API}/run`,
  'chart-maker': `${CHART_MAKER_API}/generate`,
};

import { cn } from '@/lib/utils';

const AtomAIChatBot: React.FC<AtomAIChatBotProps> = ({ atomId, atomType, atomTitle, className, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => {
    // Generate session ID only once when component mounts
    const stored = localStorage.getItem(`trinity_ai_session_${atomId}`);
    if (stored) {
      return stored;
    }
    return Math.floor(1000 + Math.random() * 90000).toString();
  });
  
  const [messages, setMessages] = useState<Message[]>(() => {
    // Load messages from localStorage if they exist
    const stored = localStorage.getItem(`trinity_ai_messages_${atomId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Ensure we have at least the initial message
        if (parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.warn('Failed to parse stored messages:', e);
      }
    }
    // Return initial message with current session ID
    const initialSessionId = localStorage.getItem(`trinity_ai_session_${atomId}`) || Math.floor(1000 + Math.random() * 90000).toString();
    return [{
      id: 'init',
      content: `Hi! I can help configure the "${atomTitle}" atom. Describe what you want to do.\n\n🆔 Session: ${initialSessionId}`,
      sender: 'ai',
      timestamp: new Date(),
    }];
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const updateAtomSettings = useLaboratoryStore(state => state.updateAtomSettings);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`trinity_ai_messages_${atomId}`, JSON.stringify(messages));
  }, [messages, atomId]);

  // Session management functions
  const handleClearChat = () => {
    const clearedMessages = [
      {
        id: 'init',
        content: `Hi! I can help configure the "${atomTitle}" atom. Describe what you want to do.\n\n🆔 Session: ${sessionId}\n💬 Chat history cleared`,
        sender: 'ai',
        timestamp: new Date(),
      },
    ];
    setMessages(clearedMessages);
    console.log('🧹 Chat history cleared for session:', sessionId);
  };

  const handleClearSession = () => {
    // Generate simple 4-5 digit session ID
    const newSessionId = Math.floor(1000 + Math.random() * 90000).toString();
    setSessionId(newSessionId);
    
    // Clear localStorage for old session
    localStorage.removeItem(`trinity_ai_session_${atomId}`);
    localStorage.removeItem(`trinity_ai_messages_${atomId}`);
    
    const newMessages = [
      {
        id: 'init',
        content: `Hi! I can help configure the "${atomTitle}" atom. Describe what you want to do.\n\n🆔 Session: ${newSessionId}`,
        sender: 'ai',
        timestamp: new Date(),
      },
    ];
    setMessages(newMessages);
    
    // Store new session data
    localStorage.setItem(`trinity_ai_session_${atomId}`, newSessionId);
    localStorage.setItem(`trinity_ai_messages_${atomId}`, JSON.stringify(newMessages));
    
    console.log('🆕 New session created:', newSessionId);
  };

  // Initialize session ID only once on component mount
  useEffect(() => {
    // Store session ID in localStorage for persistence
    localStorage.setItem(`trinity_ai_session_${atomId}`, sessionId);
    console.log('🆔 Session initialized:', sessionId);
  }, [sessionId, atomId]);

  const handleSendMessage = async () => {
    const endpoint = ENDPOINTS[atomType];
    const performEndpoint = PERFORM_ENDPOINTS[atomType];
    if (!inputValue.trim() || !endpoint) return;

    const userMsg: Message = { id: Date.now().toString(), content: inputValue, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userMsg.content,
          session_id: sessionId  // Include session ID for context
        }),
      });
      let data;
      if (res.ok) {
        data = await res.json();
        // Enhanced AI response handling with suggestions as master key
        let aiText = '';
        if (data.success) {
          // Success case - show completion message
          aiText = `✅ ${data.message || 'Operation completed successfully!'}\n\n🔄 You can now configure the operation or proceed with the current settings.`;
        } else if (Array.isArray(data.suggestions) && data.suggestions.length) {
          // Suggestions case - show enhanced suggestions
          aiText = `💡 ${data.message || 'Here\'s what I can help you with:'}\n\n${data.suggestions.join('\n\n')}`;
          
          // Add file analysis if available
          if (data.file_analysis) {
            aiText += `\n\n📊 File Analysis:\n`;
            if (data.file_analysis.total_files) {
              aiText += `• Total files available: ${data.file_analysis.total_files}\n`;
            }
            if (data.file_analysis.recommended_pairs && data.file_analysis.recommended_pairs.length > 0) {
              aiText += `• Recommended pairs: ${data.file_analysis.recommended_pairs.join(', ')}\n`;
            }
            if (data.file_analysis.common_columns && data.file_analysis.common_columns.length > 0) {
              aiText += `• Common columns: ${data.file_analysis.common_columns.join(', ')}\n`;
            }
            if (data.file_analysis.concat_tips && data.file_analysis.concat_tips.length > 0) {
              aiText += `• Tips: ${data.file_analysis.concat_tips.join(', ')}\n`;
            }
            if (data.file_analysis.merge_tips && data.file_analysis.merge_tips.length > 0) {
              aiText += `• Tips: ${data.file_analysis.merge_tips.join(', ')}\n`;
            }
          }
          
          // Add next steps if available
          if (data.next_steps && data.next_steps.length > 0) {
            aiText += `\n\n🎯 Next Steps:\n${data.next_steps.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}`;
          }
        } else {
          // Fallback case
          aiText = data.message || data.response || data.final_response || 'AI response received';
        }
        
        const aiMsg: Message = { id: (Date.now() + 1).toString(), content: aiText, sender: 'ai', timestamp: new Date() };
        setMessages(prev => [...prev, aiMsg]);
        if (atomType === 'concat' && data.concat_json) {
          const cfg = data.concat_json;
          const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
          const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
          const direction = cfg.concat_direction || 'vertical';
          
          console.log('🤖 AI CONFIG EXTRACTED:', { file1, file2, direction });
          
          // Update atom settings with the AI configuration
          updateAtomSettings(atomId, { 
            file1, 
            file2, 
            direction,
            // Store the full AI response for reference
            aiConfig: cfg,
            aiMessage: data.message
          });
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `✅ ${data.message || 'AI configuration completed'}\n\nFiles: ${file1} + ${file2}\nDirection: ${direction}\n\n🔄 Operation completed! You can now configure the concatenation or proceed with the current settings.`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);
          
          // Automatically call perform endpoint with AI configuration
          try {
            if (performEndpoint) {
              console.log('🚀 Calling perform endpoint with AI config:', { file1, file2, direction });
              
              // Extract just the filename if it's a full path
              const getFilename = (filePath: string) => {
                if (!filePath) return "";
                return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
              };
              
              const payload = {
                file1: getFilename(file1),
                file2: getFilename(file2),
                concat_direction: direction,
              };
              
              console.log('📁 Sending filenames to backend:', payload);
              
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              
              if (res2.ok) {
                const result = await res2.json();
                console.log('✅ Perform operation successful:', result);
                
                // Update atom settings with results
                updateAtomSettings(atomId, {
                  file1,
                  file2,
                  direction,
                  concatResults: result,
                  concatId: result.concat_id,
                  operationCompleted: true
                });
                
                // Add completion message
                const completionMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `🎉 Operation completed successfully!\n\nResult ID: ${result.concat_id}\nShape: ${result.result_shape}\nColumns: ${result.columns?.length || 0}`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, completionMsg]);
                
              } else {
                console.error('❌ Perform operation failed:', res2.status, res2.statusText);
                const errorMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `❌ Operation failed: ${res2.status} ${res2.statusText}`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMsg]);
                
                updateAtomSettings(atomId, {
                  file1,
                  file2,
                  direction,
                  operationCompleted: false
                });
              }
            }
          } catch (error) {
            console.error('❌ Error calling perform endpoint:', error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error: ${error.message || 'Unknown error occurred'}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            
            updateAtomSettings(atomId, {
              file1,
              file2,
              direction,
              operationCompleted: false
            });
          }
        } else if (atomType === 'merge' && data.merge_json) {
          const cfg = data.merge_json;
          const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
          const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
          const joinColumns = Array.isArray(cfg.join_columns)
            ? cfg.join_columns
            : [];
          const joinType = cfg.join_type || 'inner';
          
          console.log('🤖 AI MERGE CONFIG EXTRACTED:', { file1, file2, joinColumns, joinType });
          
          // Update atom settings with the AI configuration
          updateAtomSettings(atomId, { 
            file1, 
            file2, 
            joinColumns, 
            joinType, 
            availableColumns: joinColumns,
            // Store the full AI response for reference
            aiConfig: cfg,
            aiMessage: data.message
          });
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `✅ ${data.message || 'AI merge configuration completed'}\n\nFiles: ${file1} + ${file2}\nJoin Type: ${joinType}\nJoin Columns: ${joinColumns.join(', ')}\n\n🔄 Operation completed! You can now configure the merge or proceed with the current settings.`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);
          
          // Automatically call perform endpoint with AI configuration
          try {
            if (performEndpoint) {
              console.log('🚀 Calling merge perform endpoint with AI config:', { file1, file2, joinColumns, joinType });
              
              // Extract just the filename if it's a full path
              const getFilename = (filePath: string) => {
                if (!filePath) return "";
                return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
              };
              
              // For merge, we need to send Form data (not JSON) and use just filenames
              // Backend will handle path resolution robustly
              // IMPORTANT: Convert join columns to lowercase to match backend expectation
              const lowercaseJoinColumns = joinColumns.map(col => col.toLowerCase());
              
              const formData = new URLSearchParams({
                file1: getFilename(file1),  // Extract filename from full path
                file2: getFilename(file2),  // Extract filename from full path
                bucket_name: cfg.bucket_name || 'trinity',
                join_columns: JSON.stringify(lowercaseJoinColumns),
                join_type: joinType,
              });
              
              console.log('📁 Sending filenames to merge backend:', { 
                file1: getFilename(file1), 
                file2: getFilename(file2),
                bucket_name: cfg.bucket_name || 'trinity',
                join_columns: JSON.stringify(lowercaseJoinColumns),
                join_type: joinType
              });
              
              console.log('🔄 Column case conversion:', {
                original: joinColumns,
                lowercase: lowercaseJoinColumns
              });
              
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData,
              });
              
              if (res2.ok) {
                const result = await res2.json();
                console.log('✅ Merge operation successful:', result);
                
                // Update atom settings with results
                updateAtomSettings(atomId, {
                  file1,
                  file2,
                  joinColumns,
                  joinType,
                  availableColumns: joinColumns,
                  mergeResults: {
                    ...result,
                    result_file: null,
                    unsaved_data: result.data,
                  },
                  operationCompleted: true
                });
                
                // Add completion message
                const completionMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `🎉 Merge operation completed successfully!\n\nResult ID: ${result.merge_id}\nShape: ${result.result_shape}\nColumns: ${result.columns?.length || 0}`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, completionMsg]);
                
              } else {
                console.error('❌ Merge operation failed:', res2.status, res2.statusText);
                
                // Try to get detailed error message from backend
                let errorDetail = res2.statusText;
                try {
                  const errorData = await res2.json();
                  errorDetail = errorData.detail || errorData.message || res2.statusText;
                } catch (e) {
                  // If we can't parse error response, use status text
                }
                
                const errorMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `❌ Merge operation failed: ${res2.status}\n\nError: ${errorDetail}\n\nFiles: ${file1} + ${file2}\nJoin Columns: ${joinColumns.join(', ')}\nJoin Type: ${joinType}`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMsg]);
                
                updateAtomSettings(atomId, {
                  file1,
                  file2,
                  joinColumns,
                  joinType,
                  availableColumns: joinColumns,
                  operationCompleted: false
                });
              }
            }
          } catch (error) {
            console.error('❌ Error calling merge perform endpoint:', error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error: ${error.message || 'Unknown error occurred'}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            
            updateAtomSettings(atomId, {
              file1,
              file2,
              joinColumns,
              joinType,
              availableColumns: joinColumns,
              operationCompleted: false
            });
          }
        } else if (atomType === 'create-column' && data.json) {
          const cfg = data.json[0]; // Get first configuration object
          
          console.log('🤖 AI CREATE COLUMN CONFIG EXTRACTED:', cfg);
          
          // 🔧 CRITICAL FIX: Convert AI config to proper CreateColumn format
          const operations = [];
          
          // Parse operations from the new AI format (add_0, add_0_rename, etc.)
          const operationKeys = Object.keys(cfg).filter(key => 
            key.match(/^(add|subtract|multiply|divide|power|sqrt|log|abs|dummy|rpi|residual|stl_outlier|logistic|detrend|deseasonalize|detrend_deseasonalize|exp|standardize_zscore|standardize_minmax)_\d+$/)
          );
          
          operationKeys.forEach((opKey) => {
            const match = opKey.match(/^(\w+)_(\d+)$/);
            if (match) {
              const opType = match[1];
              const opIndex = parseInt(match[2]);
              const columns = cfg[opKey].split(',').map(col => col.trim());
              const renameKey = `${opType}_${opIndex}_rename`;
              const rename = cfg[renameKey] || '';
              
              operations.push({
                id: `${opType}_${opIndex}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: opType,
                name: opType.charAt(0).toUpperCase() + opType.slice(1),
                columns: columns,
                newColumnName: rename || `${opType}_${columns.join('_')}`,
                rename: rename,
                param: null // Will be added if param exists
              });
              
              // Check if there are parameters
              const paramKey = `${opType}_${opIndex}_param`;
              if (cfg[paramKey]) {
                operations[operations.length - 1].param = cfg[paramKey];
              }
              
              // Check if there are period parameters
              const periodKey = `${opType}_${opIndex}_period`;
              if (cfg[periodKey]) {
                operations[operations.length - 1].param = cfg[periodKey];
              }
            }
          });
          
          // 🔧 CRITICAL FIX: Set dataSource first to trigger column loading, then load columns
          updateAtomSettings(atomId, { 
            aiConfig: cfg,
            aiMessage: data.message,
            operationCompleted: false,
            // Auto-populate the CreateColumn interface - EXACTLY like GroupBy
            dataSource: cfg.object_name || '', // Note: AI uses object_name (singular)
            bucketName: cfg.bucket_name || 'trinity',
            selectedIdentifiers: cfg.identifiers || [],
            // 🔧 CRITICAL FIX: Set the file key for column loading
            file_key: cfg.object_name || '',
            // 🔧 CRITICAL FIX: Set operations in the format expected by CreateColumnCanvas
            // This ensures the UI automatically displays the AI-configured operations
            operations: operations.map((op, index) => ({
              id: op.id,
              type: op.type,
              name: op.name,
              columns: op.columns,
              newColumnName: op.newColumnName,
              rename: op.rename,
              param: op.param
            }))
          });
          
          // 🔧 CRITICAL FIX: Load columns directly after setting dataSource
          if (cfg.object_name) {
            try {
              console.log('🔄 Loading columns for AI-selected data source:', cfg.object_name);
              
              // 🔧 CRITICAL FIX: Get the current prefix and construct full object name
              let fullObjectName = cfg.object_name;
              try {
                const prefixRes = await fetch(`${VALIDATE_API}/get_object_prefix`);
                if (prefixRes.ok) {
                  const prefixData = await prefixRes.json();
                  const prefix = prefixData.prefix || '';
                  console.log('🔧 Current prefix:', prefix);
                  
                  // Construct full object name if we have a prefix
                  if (prefix && !cfg.object_name.startsWith(prefix)) {
                    fullObjectName = `${prefix}${cfg.object_name}`;
                    console.log('🔧 Constructed full object name:', fullObjectName);
                  }
                }
              } catch (prefixError) {
                console.warn('⚠️ Failed to get prefix, using original object name:', prefixError);
              }
              
              // Fetch column summary to populate allColumns with full object name
              const columnRes = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(fullObjectName)}`);
              if (columnRes.ok) {
                const columnData = await columnRes.json();
                const allColumns = Array.isArray(columnData.summary) ? columnData.summary.filter(Boolean) : [];
                
                console.log('✅ Columns loaded successfully:', allColumns.length);
                
                // Update atom settings with the loaded columns
                updateAtomSettings(atomId, {
                  allColumns: allColumns,
                  // Also set the CSV display name
                  csvDisplay: cfg.object_name.split('/').pop() || cfg.object_name
                });
                
                // 🔧 CRITICAL FIX: Also trigger the handleFrameChange logic to set up identifiers
                try {
                  // Try to fetch identifiers from backend classification
                  const resp = await fetch(`${CREATECOLUMN_API}/classification?validator_atom_id=${encodeURIComponent(atomId)}&file_key=${encodeURIComponent(cfg.object_name)}`);
                  console.log('🔍 Classification response status:', resp.status);
                  if (resp.ok) {
                    const data = await resp.json();
                    console.log('🔍 Classification identifiers:', data.identifiers);
                    updateAtomSettings(atomId, {
                      selectedIdentifiers: data.identifiers || []
                    });
                  } else {
                    // Fallback to categorical columns
                    const cats = allColumns.filter(c =>
                      c.data_type && (
                        c.data_type.toLowerCase().includes('object') ||
                        c.data_type.toLowerCase().includes('string') ||
                        c.data_type.toLowerCase().includes('category')
                      )
                    ).map(c => c.column)
                    .filter(id => !['date','time','month','months','week','weeks','year'].includes(id.toLowerCase()));
                    
                    console.log('🔧 Fallback categorical columns:', cats);
                    updateAtomSettings(atomId, {
                      selectedIdentifiers: cats
                    });
                  }
                } catch (err) {
                  console.warn('⚠️ Failed to fetch classification, using fallback:', err);
                  // Fallback to categorical columns
                  const cats = allColumns.filter(c =>
                    c.data_type && (
                      c.data_type.toLowerCase().includes('object') ||
                      c.data_type.toLowerCase().includes('string') ||
                      c.data_type.toLowerCase().includes('category')
                    )
                  ).map(c => c.column)
                  .filter(id => !['date','time','month','months','week','weeks','year'].includes(id.toLowerCase()));
                  
                  console.log('🔧 Fallback categorical columns (catch):', cats);
                  updateAtomSettings(atomId, {
                    selectedIdentifiers: cats
                  });
                }
                
              } else {
                console.warn('⚠️ Failed to load columns for data source:', cfg.object_name);
              }
            } catch (error) {
              console.error('❌ Error loading columns for data source:', error);
            }
          }
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `✅ ${data.message || 'AI create column configuration completed'}\n\nFile: ${cfg.object_name || 'N/A'}\nOperations: ${operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', ')}\n\n🔄 Configuration loaded! Now executing the Create Column operations...`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);

          // 🔧 CRITICAL FIX: Automatically execute the operations (like GroupBy)
          // Wait a bit for the UI to update, then automatically perform the operations
          setTimeout(async () => {
            try {
              console.log('🚀 Auto-executing Create Column operations with AI config');
              
              // Extract just the filename if it's a full path
              const getFilename = (filePath: string) => {
                if (!filePath) return "";
                return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
              };
              
              // 🔧 CRITICAL FIX: Convert to FormData format that CreateColumn backend expects
              const formData = new FormData();
              formData.append('object_names', getFilename(cfg.object_name || ''));
              formData.append('bucket_name', cfg.bucket_name || 'trinity');
              
              // Add operations in the format backend expects
              operations.forEach((op, index) => {
                if (op.columns && op.columns.filter(Boolean).length > 0) {
                  const colString = op.columns.filter(Boolean).join(',');
                  const rename = op.rename && op.rename.trim() ? op.rename.trim() : '';
                  const key = `${op.type}_${index}`;
                  
                  // Add the operation
                  formData.append(key, colString);
                  
                  // Add rename if specified
                  if (rename) {
                    formData.append(`${key}_rename`, rename);
                  }
                  
                  // Add parameters if specified
                  if (op.param) {
                    if (['detrend', 'deseasonalize', 'detrend_deseasonalize'].includes(op.type)) {
                      formData.append(`${key}_period`, String(op.param));
                    } else if (op.type === 'power') {
                      formData.append(`${key}_param`, String(op.param));
                    } else if (op.type === 'logistic') {
                      formData.append(`${key}_param`, JSON.stringify(op.param));
                    }
                  }
                }
              });
              
              // Add identifiers
              const identifiers = cfg.identifiers || [];
              formData.append('identifiers', identifiers.join(','));
              
              console.log('📁 Auto-executing with form data:', {
                object_names: getFilename(cfg.object_name || ''),
                bucket_name: cfg.bucket_name || 'trinity',
                operations: operations.map((op, index) => ({
                  index,
                  type: op.type,
                  columns: op.columns,
                  rename: op.rename,
                  param: op.param
                })),
                identifiers: identifiers
              });
              
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                body: formData,
              });
              
              if (res2.ok) {
                const result = await res2.json();
                console.log('✅ Auto-execution successful:', result);
                
                // 🔧 CRITICAL FIX: Update atom settings with results
                updateAtomSettings(atomId, {
                  operationCompleted: true,
                  createColumnResults: result
                });
                
                // Add success message
                const completionMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `🎉 Create Column operations completed successfully!\n\nFile: ${cfg.object_name || 'N/A'}\nOperations: ${operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', ')}\n\n📊 Results are ready! New columns have been created.\n\n💡 You can now view the results in the Create Column interface.`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, completionMsg]);
                
              } else {
                console.error('❌ Auto-execution failed:', res2.status, res2.statusText);
                
                // Try to get detailed error message
                let errorDetail = res2.statusText;
                try {
                  const errorData = await res2.json();
                  errorDetail = errorData.detail || errorData.message || res2.statusText;
                } catch (e) {
                  // If we can't parse error response, use status text
                }
                
                const errorMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `❌ Auto-execution failed: ${res2.status}\n\nError: ${errorDetail}\n\nFile: ${cfg.object_name || 'N/A'}\nOperations: ${operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', ')}\n\n💡 Please try clicking the Perform button manually.`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMsg]);
                
                updateAtomSettings(atomId, {
                  operationCompleted: false
                });
              }
              
            } catch (error) {
              console.error('❌ Error during auto-execution:', error);
              
              const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                content: `❌ Auto-execution error: ${error.message || 'Unknown error occurred'}\n\nFile: ${cfg.object_name || 'N/A'}\nOperations: ${operations.map(op => `${op.type}(${op.columns.join(', ')})`).join(', ')}\n\n💡 Please try clicking the Perform button manually.`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, errorMsg]);
              
              updateAtomSettings(atomId, {
                operationCompleted: false
              });
            }
          }, 1000); // Wait 1 second for UI to update
          
          // 🔧 CRITICAL FIX: Operations are now auto-executed above
          // No need for manual execution - the AI automatically performs the operations
        } else if (atomType === 'groupby-wtg-avg' && data.groupby_json) {
          const cfg = data.groupby_json;
          
          console.log('🤖 AI GROUPBY CONFIG EXTRACTED:', cfg);
          console.log('🔍 AI CONFIG DETAILS:', {
            object_names: cfg.object_names,
            file_name: cfg.file_name,
            file_key: cfg.file_key,
            identifiers: cfg.identifiers,
            aggregations: cfg.aggregations
          });
          
          // 🔧 CRITICAL FIX: Automatically populate GroupBy settings with AI configuration
          const aiSelectedIdentifiers = cfg.identifiers || [];
          const aiSelectedMeasures = [];
          
          // 🔧 FIX: Ensure we have a single file, not multiple files
          let singleFileName = '';
          
          // Try multiple possible fields from AI response
          const possibleFileFields = [
            cfg.object_names,
            cfg.file_name,
            cfg.file_key,
            cfg.data_source,
            cfg.source_file
          ].filter(Boolean);
          
          if (possibleFileFields.length > 0) {
            singleFileName = possibleFileFields[0];
            // If object_names contains multiple files (comma-separated), take only the first one
            if (singleFileName.includes(',')) {
              singleFileName = singleFileName.split(',')[0].trim();
              console.log('🔧 Multiple files detected, using first file:', singleFileName);
            }
            console.log('🔧 Using file path from AI response:', singleFileName);
          }
          
          // 🔧 CRITICAL FIX: If AI didn't provide a real file path, try to get it from atom settings
          if (!singleFileName || singleFileName === 'your_file.csv' || singleFileName === 'N/A') {
            console.log('⚠️ AI provided placeholder filename, trying to get real file path from atom settings');
            
            // Try to get the real data source from the current atom settings
            const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
            const realDataSource = currentAtom?.settings?.dataSource;
            
            if (realDataSource && realDataSource !== 'your_file.csv' && realDataSource !== 'N/A') {
              singleFileName = realDataSource;
              console.log('✅ Using real file path from atom settings:', singleFileName);
            } else {
              // Still no real file path - show error and don't proceed
              const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                content: `❌ Cannot proceed: No valid file path found\n\nAI provided: ${cfg.object_names || 'N/A'}\nAtom settings: ${realDataSource || 'N/A'}\n\n💡 Please ensure you have selected a data file before using AI GroupBy.`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, errorMsg]);
              
              updateAtomSettings(atomId, { 
                aiConfig: cfg,
                aiMessage: data.message,
                operationCompleted: false,
                selectedIdentifiers: aiSelectedIdentifiers,
                selectedMeasures: aiSelectedMeasures,
                selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                dataSource: '',
                bucketName: cfg.bucket_name || 'trinity'
              });
              
              return; // Don't proceed with the operation
            }
          }
          
          // 🔧 FIX: Convert AI aggregations to selectedMeasures format with proper validation
          if (cfg.aggregations && typeof cfg.aggregations === 'object') {
            Object.entries(cfg.aggregations).forEach(([field, aggConfig]) => {
              if (typeof aggConfig === 'object' && aggConfig !== null) {
                const agg = (aggConfig as any).agg;
                if (agg) {
                  // 🔧 VALIDATION: Only allow numeric fields for aggregations
                  // This will be validated when the backend loads the actual data
                  aiSelectedMeasures.push({
                    field: field,
                    aggregator: agg === 'sum' ? 'Sum' : 
                                agg === 'mean' ? 'Mean' : 
                                agg === 'min' ? 'Min' : 
                                agg === 'max' ? 'Max' : 
                                agg === 'count' ? 'Count' : 
                                agg === 'median' ? 'Median' : 
                                agg === 'weighted_mean' ? 'Weighted Mean' : 
                                agg === 'rank_pct' ? 'Rank Percentile' : 'Sum',
                    weight_by: (aggConfig as any).weight_by || '',
                    rename_to: (aggConfig as any).rename_to || field
                  });
                }
              } else if (typeof aggConfig === 'string') {
                // Handle simple string aggregations
                aiSelectedMeasures.push({
                  field: field,
                  aggregator: aggConfig === 'sum' ? 'Sum' : 
                              aggConfig === 'mean' ? 'Mean' : 
                              aggConfig === 'min' ? 'Min' : 
                              aggConfig === 'max' ? 'Max' : 
                              aggConfig === 'count' ? 'Count' : 
                              aggConfig === 'median' ? 'Median' : 
                              aggConfig === 'weighted_mean' ? 'Weighted Mean' : 
                              aggConfig === 'rank_pct' ? 'Rank Percentile' : 'Sum',
                  weight_by: '',
                  rename_to: field
                });
              }
            });
          }
          
          // 🔧 FIX: If no aggregations specified, create sensible defaults for numeric columns
          if (aiSelectedMeasures.length === 0 && aiSelectedIdentifiers.length > 0) {
            // Default to sum of volume (common numeric measure)
            aiSelectedMeasures.push({
              field: 'volume', // Will be validated when data is loaded
              aggregator: 'Sum',
              weight_by: '',
              rename_to: 'total_volume'
            });
          }
          
          console.log('🔧 AUTO-POPULATED GROUPBY SETTINGS:', {
            selectedIdentifiers: aiSelectedIdentifiers,
            selectedMeasures: aiSelectedMeasures,
            singleFileName: singleFileName
          });
          
          // 🔧 CRITICAL FIX: Final validation - ensure we have a valid file path
          if (!singleFileName || singleFileName === 'your_file.csv' || singleFileName === 'N/A') {
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Cannot proceed: Invalid file path\n\nFile path: ${singleFileName}\n\n💡 Please ensure you have selected a valid data file before using AI GroupBy.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            return; // Don't proceed with the operation
          }
          
          // Update atom settings with the AI configuration and auto-populated options
          updateAtomSettings(atomId, { 
            aiConfig: cfg,
            aiMessage: data.message,
            operationCompleted: false,
            // Auto-populate the interface
            selectedIdentifiers: aiSelectedIdentifiers,
            selectedMeasures: aiSelectedMeasures,
            selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
            // Set default aggregation methods
            selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
            // Set data source if available - use single file only
            dataSource: singleFileName || cfg.file_key || '',
            // Set bucket name
            bucketName: cfg.bucket_name || 'trinity'
          });
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `✅ ${data.message || 'AI groupby configuration completed'}\n\nFile: ${singleFileName || 'N/A'}\nIdentifiers: ${cfg.identifiers?.join(', ') || 'N/A'}\nAggregations: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}\n\n🔄 Operation completed! You can now configure the groupby or proceed with the current settings.`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);
          
          // 🔧 CRITICAL FIX: Automatically call perform endpoint with AI configuration and validate real results
          try {
            if (performEndpoint) {
              console.log('🚀 Calling groupby perform endpoint with AI config:', { 
                singleFileName, 
                aiSelectedIdentifiers, 
                aiSelectedMeasures 
              });
              
              // Extract just the filename if it's a full path
              const getFilename = (filePath: string) => {
                if (!filePath) return "";
                return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
              };
              
              // Convert to FormData format that GroupBy backend expects
              const formData = new URLSearchParams({
                validator_atom_id: atomId, // 🔧 CRITICAL: Add required validator_atom_id
                file_key: getFilename(singleFileName), // 🔧 CRITICAL: Add required file_key
                object_names: getFilename(singleFileName),
                bucket_name: cfg.bucket_name || 'trinity',
                identifiers: JSON.stringify(aiSelectedIdentifiers),
                aggregations: JSON.stringify(aiSelectedMeasures.reduce((acc, m) => {
                  // 🔧 CRITICAL FIX: Convert to backend-expected format
                  // Backend expects: { "field_name": { "agg": "sum", "weight_by": "", "rename_to": "" } }
                  acc[m.field] = {
                    agg: m.aggregator.toLowerCase(),
                    weight_by: m.weight_by || '',
                    rename_to: m.rename_to || m.field
                  };
                  return acc;
                }, {}))
              });
              
              console.log('📁 Sending groupby data to backend:', {
                validator_atom_id: atomId,
                file_key: getFilename(singleFileName),
                object_names: getFilename(singleFileName),
                bucket_name: cfg.bucket_name || 'trinity',
                identifiers: aiSelectedIdentifiers,
                aggregations: aiSelectedMeasures.reduce((acc, m) => {
                  acc[m.field] = {
                    agg: m.aggregator.toLowerCase(),
                    weight_by: m.weight_by || '',
                    rename_to: m.rename_to || m.field
                  };
                  return acc;
                }, {})
              });
              
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData,
              });
              
              if (res2.ok) {
                const result = await res2.json();
                console.log('✅ GroupBy operation successful:', result);
                
                // 🔧 CRITICAL FIX: Backend has completed and saved the file
                // Now we need to retrieve the actual results from the saved file
                if (result.status === 'SUCCESS' && result.result_file) {
                  console.log('🔄 Backend operation completed, retrieving results from saved file:', result.result_file);
                  
                  // 🔧 FIX: Retrieve results from the saved file using the cached_dataframe endpoint
                  try {
                    const cachedRes = await fetch(`${GROUPBY_API}/cached_dataframe?object_name=${encodeURIComponent(result.result_file)}`);
                    if (cachedRes.ok) {
                      const csvText = await cachedRes.text();
                      console.log('📄 Retrieved CSV data from saved file, length:', csvText.length);
                      
                      // Parse CSV to get actual results
                      const lines = csvText.split('\n');
                      if (lines.length > 1) {
                        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                        const rows = lines.slice(1).filter(line => line.trim()).map(line => {
                          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                          const row: any = {};
                          headers.forEach((header, index) => {
                            row[header] = values[index] || '';
                          });
                          return row;
                        });
                        
                        console.log('✅ Successfully parsed results from saved file:', {
                          rowCount: rows.length,
                          columns: headers.length,
                          sampleData: rows.slice(0, 2)
                        });
                        
                        // ✅ REAL RESULTS AVAILABLE - Update atom settings with actual data
                        updateAtomSettings(atomId, {
                          selectedIdentifiers: aiSelectedIdentifiers,
                          selectedMeasures: aiSelectedMeasures,
                          selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                          selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                          dataSource: singleFileName || cfg.file_key || '',
                          bucketName: cfg.bucket_name || 'trinity',
                          groupbyResults: {
                            ...result,
                            // 🔧 CRITICAL: Store the actual grouped data from saved file
                            unsaved_data: rows,
                            result_file: result.result_file,
                            row_count: rows.length,
                            columns: headers
                          },
                          operationCompleted: true
                        });
                        
                        // ✅ SUCCESS MESSAGE WITH REAL DATA FROM SAVED FILE
                        const completionMsg: Message = {
                          id: (Date.now() + 1).toString(),
                          content: `🎉 GroupBy operation completed successfully!\n\nResult File: ${result.result_file}\nRows: ${rows.length.toLocaleString()}\nColumns: ${headers.length}\n\n📊 Results are ready! The data has been grouped and saved.\n\n💡 You can now view the results in the GroupBy interface - no need to click Perform again!`,
                          sender: 'ai',
                          timestamp: new Date(),
                        };
                        setMessages(prev => [...prev, completionMsg]);
                        
                      } else {
                        throw new Error('No data rows found in CSV');
                      }
                    } else {
                      throw new Error(`Failed to fetch cached results: ${cachedRes.status}`);
                    }
                  } catch (fetchError) {
                    console.error('❌ Error fetching results from saved file:', fetchError);
                    
                    // ⚠️ File saved but couldn't retrieve results - still mark as successful
                    updateAtomSettings(atomId, {
                      selectedIdentifiers: aiSelectedIdentifiers,
                      selectedMeasures: aiSelectedMeasures,
                      selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                      selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                      dataSource: singleFileName || cfg.file_key || '',
                      bucketName: cfg.bucket_name || 'trinity',
                      groupbyResults: {
                        ...result,
                        result_file: result.result_file,
                        row_count: result.row_count || 0,
                        columns: result.columns || []
                      },
                      operationCompleted: true
                    });
                    
                    // ⚠️ WARNING MESSAGE - File saved but results retrieval failed
                    const warningMsg: Message = {
                      id: (Date.now() + 1).toString(),
                      content: `⚠️ GroupBy operation completed and file saved, but results display failed\n\nResult File: ${result.result_file}\nRows: ${result.row_count || 'Unknown'}\nColumns: ${result.columns?.length || 'Unknown'}\n\n📁 File has been saved successfully. Please click the Perform button to view the results.`,
                      sender: 'ai',
                      timestamp: new Date(),
                    };
                    setMessages(prev => [...prev, warningMsg]);
                  }
                  
                } else {
                  // ❌ Backend operation failed
                  console.error('❌ GroupBy backend operation failed:', result);
                  
                  updateAtomSettings(atomId, {
                    selectedIdentifiers: aiSelectedIdentifiers,
                    selectedMeasures: aiSelectedMeasures,
                    selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                    selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                    dataSource: singleFileName || cfg.file_key || '',
                    bucketName: cfg.bucket_name || 'trinity',
                    operationCompleted: false
                  });
                  
                  const errorMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    content: `❌ GroupBy operation failed: ${result.error || 'Unknown error'}\n\nFile: ${singleFileName}\nIdentifiers: ${aiSelectedIdentifiers.join(', ')}\nMeasures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}\n\n💡 Please check your configuration and try clicking the Perform button manually.`,
                    sender: 'ai',
                    timestamp: new Date(),
                  };
                  setMessages(prev => [...prev, errorMsg]);
                }
              } else {
                console.error('❌ GroupBy operation failed:', res2.status, res2.statusText);
                
                // Try to get detailed error message from backend
                let errorDetail = res2.statusText;
                try {
                  const errorData = await res2.json();
                  errorDetail = errorData.detail || errorData.message || res2.statusText;
                } catch (e) {
                  // If we can't parse error response, use status text
                }
                
                const errorMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `❌ GroupBy operation failed: ${res2.status}\n\nError: ${errorDetail}\n\nFile: ${singleFileName}\nIdentifiers: ${aiSelectedIdentifiers.join(', ')}\nMeasures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}\n\n💡 Please check your configuration and try clicking the Perform button manually.`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMsg]);
                
                updateAtomSettings(atomId, {
                  selectedIdentifiers: aiSelectedIdentifiers,
                  selectedMeasures: aiSelectedMeasures,
                  selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                  selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                  dataSource: singleFileName || cfg.file_key || '',
                  bucketName: cfg.bucket_name || 'trinity',
                  operationCompleted: false
                });
              }
            }
          } catch (error) {
            console.error('❌ Error calling groupby perform endpoint:', error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error: ${error.message || 'Unknown error occurred'}\n\nFile: ${singleFileName}\nIdentifiers: ${aiSelectedIdentifiers.join(', ')}\nMeasures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}\n\n💡 Please try clicking the Perform button manually.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            
            updateAtomSettings(atomId, {
              selectedIdentifiers: aiSelectedIdentifiers,
              selectedMeasures: aiSelectedMeasures,
              selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
              selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
              dataSource: singleFileName || cfg.file_key || '',
              bucketName: cfg.bucket_name || 'trinity',
              operationCompleted: false
            });
          }
                 } else if (atomType === 'chart-maker' && data.chart_json) {
          // 🔧 SIMPLIFIED LOGIC: chart_json is always a list
          // Single chart: chart_json contains 1 chart configuration
          // Two charts: chart_json contains 2 chart configurations
          
          console.log('🔍 ===== CHART MAKER AI RESPONSE =====');
          console.log('📝 User Prompt:', userMsg.content);
          
          // 🔧 UNIFIED APPROACH: chart_json is always an array
          const chartsList = Array.isArray(data.chart_json) ? data.chart_json : [data.chart_json];
          const numberOfCharts = chartsList.length;
          
          console.log('📊 Charts in chart_json:', numberOfCharts);
          console.log('🔍 ===== END CHART ANALYSIS =====');
          
          // 🔧 GET TARGET FILE: Use the exact keys from LLM response
          let targetFile = '';
          
          // Priority 1: Use AI-provided file name (exact keys from LLM)
          if (data.file_name || data.data_source) {
            targetFile = data.file_name || data.data_source;
            console.log('🎯 Using AI-provided file name:', targetFile);
          } else {
            console.log('⚠️ No file name found in AI response');
          }
          
          if (!targetFile) {
            // No file found - show error and don't proceed
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Cannot proceed: No valid file found for chart generation\n\nAI provided: ${data.file_name || 'N/A'}\nContext: ${data.file_context?.available_files?.join(', ') || 'N/A'}\n\n💡 Please ensure you have selected a data file before using AI Chart Maker.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            return;
          }
          
          // 🔧 CREATE CHART CONFIGURATIONS: chart_json is always a list
          let charts: any[] = [];
          
          console.log('🔧 Processing charts from chart_json list...');
          
          charts = chartsList.map((chartConfig: any, index: number) => {
            const chartType = chartConfig.chart_type || 'bar';
            const traces = chartConfig.traces || [];
            const title = chartConfig.title || `Chart ${index + 1}`;
            
            return {
              id: `ai_chart_${chartConfig.chart_id || index + 1}_${Date.now()}`,
              title: title,
              type: chartType as 'line' | 'bar' | 'area' | 'pie' | 'scatter',
              xAxis: traces[0]?.x_column || '',
              yAxis: traces[0]?.y_column || '',
              filters: {},
              chartRendered: false,
              isAdvancedMode: traces.length > 1,
              traces: traces.map((trace: any, traceIndex: number) => ({
                id: `trace_${traceIndex}`,
                x_column: trace.x_column || '', // 🔧 FIX: Use correct property name
                y_column: trace.y_column || '', // 🔧 FIX: Use correct property name
                yAxis: trace.y_column || '', // Keep for backward compatibility
                name: trace.name || `Trace ${traceIndex + 1}`,
                color: trace.color || undefined,
                aggregation: trace.aggregation || 'sum',
                filters: {}
              }))
            };
          });
          
          console.log('🔧 Processed charts:', charts.length);
          
          // 🔧 CRITICAL FIX: Update atom settings with the AI configuration AND load data
          updateAtomSettings(atomId, { 
            aiConfig: data,
            aiMessage: data.message,
            // Add the AI-generated charts to the charts array
            charts: charts,
            // 🔧 CRITICAL: Set proper data source and file ID for chart rendering
            dataSource: targetFile,
            fileId: targetFile,
            // Set the first chart as active
            currentChart: charts[0],
            // Mark that AI has configured the chart(s)
            aiConfigured: true,
            // Set multiple charts configuration based on list length
            multipleCharts: numberOfCharts > 1,
            numberOfCharts: numberOfCharts,
            // Set chart type and basic settings for first chart
            chartType: charts[0].type,
            chartTitle: charts[0].title,
            xAxisColumn: charts[0].xAxis,
            yAxisColumn: charts[0].yAxis,
            // 🔧 CRITICAL: Set chart rendering state to trigger data loading
            chartRendered: false,
            chartLoading: false
          });
          
          // 🔧 CRITICAL FIX: Connect to actual file system and load real data
          try {
            console.log('🔄 Connecting AI chart to actual file system...');
            
            // 🔧 STEP 1: Load the actual file data using the chart-maker backend
            console.log('📥 Loading actual file data from backend:', targetFile);
            
            // Call the chart-maker backend to load the saved dataframe
            const loadResponse = await fetch(`${CHART_MAKER_API}/load-saved-dataframe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ object_name: targetFile })
            });
            
            if (loadResponse.ok) {
              const fileData = await loadResponse.json();
              console.log('✅ File data loaded successfully:', fileData);
              
              // 🔧 STEP 2: Update atom settings with REAL file data
              updateAtomSettings(atomId, {
                dataSource: targetFile,
                fileId: fileData.file_id,
                uploadedData: {
                  columns: fileData.columns,
                  rows: fileData.sample_data,
                  numeric_columns: fileData.numeric_columns,
                  categorical_columns: fileData.categorical_columns,
                  unique_values: fileData.unique_values,
                  file_id: fileData.file_id,
                  row_count: fileData.row_count
                },
                chartRendered: false, // Will be rendered when chart is generated
                chartLoading: false
              });
              
              // 🔧 STEP 3: Generate charts using the backend - UNIFIED APPROACH
              console.log('🚀 Generating charts with backend data...');
              
              // Generate each chart separately by calling FastAPI multiple times
              const generatedCharts = [];
              
              for (let i = 0; i < charts.length; i++) {
                const chart = charts[i];
                const chartType = chart.type;
                const traces = chart.traces || [];
                const title = chart.title;
                
                console.log(`📊 Generating chart ${i + 1}/${charts.length}: ${title} (${chartType})`);
                
                const chartRequest = {
                  file_id: fileData.file_id,
                  chart_type: chartType,
                  traces: traces.map(trace => ({
                    x_column: trace.x_column || chart.xAxis,
                    y_column: trace.y_column || chart.yAxis,
                    name: trace.name || `Trace ${traces.indexOf(trace) + 1}`,
                    chart_type: trace.chart_type || chartType,
                    aggregation: trace.aggregation || 'sum'
                  })),
                  title: title
                };
                
                console.log(`📊 Chart ${i + 1} request payload:`, chartRequest);
                
                try {
                  const chartResponse = await fetch(`${CHART_MAKER_API}/charts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(chartRequest)
                  });
                  
                  if (chartResponse.ok) {
                    const chartResult = await chartResponse.json();
                    console.log(`✅ Chart ${i + 1} generated successfully:`, chartResult);
                    
                    // Update chart configuration with backend-generated chart
                    const updatedChart = {
                      ...chart,
                      chartConfig: chartResult.chart_config,
                      filteredData: chartResult.chart_config.data,
                      chartRendered: true,
                      chartLoading: false,
                      lastUpdateTime: Date.now()
                    };
                    
                    generatedCharts.push(updatedChart);
                    
                  } else {
                    console.error(`❌ Chart ${i + 1} generation failed:`, chartResponse.status);
                    
                    // Try to get detailed error message
                    let errorDetail = chartResponse.statusText;
                    try {
                      const errorData = await chartResponse.json();
                      errorDetail = errorData.detail || errorData.message || chartResponse.statusText;
                    } catch (e) {
                      // If we can't parse error response, use status text
                    }
                    
                    // Add error message for this specific chart
                    const errorMsg: Message = {
                      id: (Date.now() + i).toString(),
                      content: `⚠️ Chart ${i + 1} generation failed: ${chartResponse.status}\n\nError: ${errorDetail}\n\nChart: ${title} (${chartType})\n\n💡 This chart may need manual generation.`,
                      sender: 'ai',
                      timestamp: new Date(),
                    };
                    setMessages(prev => [...prev, errorMsg]);
                    
                    // Add failed chart with error state
                    generatedCharts.push({
                      ...chart,
                      chartRendered: false,
                      chartLoading: false,
                      error: errorDetail
                    });
                  }
                } catch (error) {
                  console.error(`❌ Error generating chart ${i + 1}:`, error);
                  
                  // Add error message for this specific chart
                  const errorMsg: Message = {
                    id: (Date.now() + i).toString(),
                    content: `❌ Error generating chart ${i + 1}: ${error.message || 'Unknown error occurred'}\n\nChart: ${title} (${chartType})\n\n💡 This chart may need manual generation.`,
                    sender: 'ai',
                    timestamp: new Date(),
                  };
                  setMessages(prev => [...prev, errorMsg]);
                  
                  // Add failed chart with error state
                  generatedCharts.push({
                    ...chart,
                    chartRendered: false,
                    chartLoading: false,
                    error: error.message || 'Unknown error'
                  });
                }
              }
              
              // 🔧 STEP 4: Update atom settings with all generated charts
              updateAtomSettings(atomId, {
                charts: generatedCharts,
                currentChart: generatedCharts[0] || charts[0],
                chartRendered: generatedCharts.some(chart => chart.chartRendered),
                chartLoading: false
              });
              
              console.log('🎉 Charts processed:', generatedCharts.length);
              
              // 🔧 CLEANED UP: Show only essential success information
              const successCount = generatedCharts.filter(chart => chart.chartRendered).length;
              const totalCount = generatedCharts.length;
              
              if (totalCount > 1) {
                // Multiple charts - simple success message
                const successMsg: Message = {
                  id: (Date.now() + 3).toString(),
                  content: `✅ ${successCount}/${totalCount} charts generated successfully!\n\n💡 Use the 2-chart layout option to view them simultaneously.`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, successMsg]);
              } else {
                // Single chart - simple success message
                const successMsg: Message = {
                  id: (Date.now() + 3).toString(),
                  content: `✅ Chart generated successfully with real data!`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, successMsg]);
              }
              
            } else {
              console.error('❌ Failed to load file data:', loadResponse.status);
              
              // Try to get detailed error message
              let errorDetail = loadResponse.statusText;
              try {
                const errorData = await loadResponse.json();
                errorDetail = errorData.detail || errorData.message || loadResponse.statusText;
              } catch (e) {
                // If we can't parse error response, use status text
              }
              
              // Fallback to manual rendering
              updateAtomSettings(atomId, {
                chartRendered: false,
                chartLoading: false
              });
              
              const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                content: `⚠️ Failed to load file data: ${errorDetail}\n\n💡 Please ensure the file exists and try again.`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, errorMsg]);
            }
            
          } catch (error) {
            console.error('❌ Error in AI chart setup:', error);
            
            // Fallback to manual rendering
            updateAtomSettings(atomId, {
              chartRendered: false,
              chartLoading: false
            });
            
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error setting up chart: ${error.message || 'Unknown error occurred'}\n\n💡 Please try generating the chart manually.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
          }
          
          // 🔧 CLEANED UP: Show only LLM suggestions for better user experience
          let aiContent = '';
          
          if (numberOfCharts > 1) {
            // Multiple charts - show LLM suggestions
            aiContent = `💡 ${data.message || 'Multiple chart configuration completed successfully'}\n\n`;
            
            // Add LLM suggestions if available
            if (data.suggestions && Array.isArray(data.suggestions)) {
              aiContent += `${data.suggestions.join('\n')}\n\n`;
            }
            
            // Add next steps if available
            if (data.next_steps && Array.isArray(data.next_steps)) {
              aiContent += `🎯 Next Steps:\n${data.next_steps.join('\n')}`;
            }
            
          } else {
            // Single chart - show LLM suggestions
            aiContent = `💡 ${data.message || 'Chart configuration completed successfully'}\n\n`;
            
            // Add LLM suggestions if available
            if (data.suggestions && Array.isArray(data.suggestions)) {
              aiContent += `${data.suggestions.join('\n')}\n\n`;
            }
            
            // Add next steps if available
            if (data.next_steps && Array.isArray(data.next_steps)) {
              aiContent += `🎯 Next Steps:\n${data.next_steps.join('\n')}`;
            }
          }
          
          // Single clean message with LLM suggestions
          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: aiContent,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiMsg]);
          
        }
      } else {
        // Handle AI suggestions when complete info is not available
        if (data && data.suggestions && Array.isArray(data.suggestions)) {
          const suggestionsMsg: Message = { 
            id: (Date.now() + 1).toString(), 
            content: `💡 ${data.message || 'AI needs more information'}\n\n${data.suggestions.join('\n')}\n\n${data.next_steps ? data.next_steps.join('\n') : ''}`,
            sender: 'ai', 
            timestamp: new Date() 
          };
          setMessages(prev => [...prev, suggestionsMsg]);
          
          // Store suggestions for potential use
          updateAtomSettings(atomId, {
            aiSuggestions: data.suggestions,
            aiNextSteps: data.next_steps || [],
            recommendedFiles: data.recommended_files || []
          });
        } else {
          const aiMsg: Message = { id: (Date.now() + 1).toString(), content: 'Request failed', sender: 'ai', timestamp: new Date() };
          setMessages(prev => [...prev, aiMsg]);
        }
      }
    } catch {
      const aiMsg: Message = { id: (Date.now() + 1).toString(), content: 'Could not reach AI service', sender: 'ai', timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={o => !disabled && setIsOpen(o)}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'p-1 hover:bg-gray-100 rounded',
            disabled ? 'cursor-not-allowed opacity-50' : '',
            className,
          )}
          title="Atom AI"
          disabled={disabled}
        >
          <Sparkles className={cn('w-3.5 h-3.5', disabled ? 'text-gray-300' : 'text-purple-500')} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 h-80 p-0 flex flex-col"
        align="start"
        side="bottom"
        sideOffset={8}
        style={{ resize: 'both', overflow: 'auto' }}
      >
        <div className="p-2 border-b border-gray-200 bg-white rounded-t-md flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-gray-800">{atomTitle} AI</span>
            {/* Session ID Display */}
            {sessionId && (
              <div className="flex items-center space-x-2 ml-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-gray-600 font-mono">
                  Session: {sessionId}
                </span>
                <span className="text-xs text-green-600 font-medium">● Active</span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {/* Session Management Buttons - Icon-based like ChatGPT */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearChat} 
              className="h-6 w-6 p-0 text-gray-600 hover:text-gray-800 hover:bg-gray-100"
              title="Clear chat history (keep session)"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearSession} 
              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
              title="Start new session (fresh start)"
            >
              <Plus className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-6 w-6 p-0">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1 p-2">
          <div className="space-y-2">
            {messages.map(m => (
              <div key={m.id} className={`flex items-start space-x-2 ${m.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${m.sender === 'ai' ? 'bg-purple-500' : 'bg-gray-600'}`}>
                  {m.sender === 'ai' ? <Bot className="w-3 h-3 text-white" /> : <User className="w-3 h-3 text-white" />}
                </div>
                <Card className={`p-2 text-sm ${m.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200'}`}>{m.content}</Card>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start space-x-2">
                <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <Card className="p-2 bg-white border border-gray-200">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-2 border-t border-gray-200 bg-white rounded-b-md">
          <div className="flex space-x-2">
            <Textarea value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyPress={handleKeyPress} placeholder="Ask AI..." className="flex-1 resize-none h-8" />
            <Button onClick={handleSendMessage} disabled={!inputValue.trim() || isLoading} className="h-8 px-2 bg-blue-500 text-white">
              <Send className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AtomAIChatBot;
