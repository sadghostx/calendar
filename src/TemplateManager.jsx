// --- TEMPLATE MANAGER COMPONENT ---// 
//--------------------------------------------------//

// src/TemplateManager.jsx

import React, { useState, useEffect } from 'react';
// Corrected import: DAYS is now exported from App.jsx
import { Button, Input, Select, DAYS } from './App'; 

// --- Utility function imports ---
import { X } from 'lucide-react'; // X icon used inside TemplateManager

const TemplateManager = ({ templates, events, eventTypes, activeSite, onSave, onDelete, onApply, canEdit, WAR_ICONS }) => {
    
    // Fallback for defaultWeek if eventTypes is empty
    const defaultWeek = DAYS.map(day => ({ 
        day, 
        title: '', 
        time: '00:00', 
        duration: 24, 
        timeZone: 'local', 
        categoryId: eventTypes.length > 0 ? eventTypes[0].id : null 
    }));

    const [editingTemplate, setEditingTemplate] = useState(null);
    const [templateName, setTemplateName] = useState('');
    const [weekEvents, setWeekEvents] = useState(defaultWeek);

    useEffect(() => {
        if (editingTemplate) {
            setTemplateName(editingTemplate.name);
            setWeekEvents(editingTemplate.events);
        } else {
            setTemplateName('');
            
            // Re-calculate and set the default week here
            const newDefaultWeek = DAYS.map(day => ({ 
                day, 
                title: '', 
                time: '00:00', 
                duration: 24, 
                timeZone: 'local', 
                categoryId: eventTypes.length > 0 ? eventTypes[0].id : null 
            }));
            setWeekEvents(newDefaultWeek); 
        }
    }, [editingTemplate, eventTypes]); 

    const handleFieldChange = (index, field, value) => {
        setWeekEvents(prev => prev.map((evt, i) => i === index ? { ...evt, [field]: value } : evt));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            id: editingTemplate?.id,
            name: templateName,
            events: weekEvents,
        });
        setEditingTemplate(null);
    };
    
    const handleSaveFromCalendar = () => {
        const today = new Date();
        const dayOfWeek = today.getDay(); 
        const startOfWeek = new Date(today);
        // Calculate the date for the previous Sunday (or today if it's Sunday)
        startOfWeek.setDate(today.getDate() - dayOfWeek); 

        const currentWeekEvents = [];
        
        for(let i = 0; i < 7; i++) {
            const day = new Date(startOfWeek);
            day.setDate(startOfWeek.getDate() + i);
            
            // Get all events for that specific day
            const eventsForDay = events.filter(e => {
                const eventDate = new Date(e.start);
                // Check if the event's UTC date matches the calendar day's UTC date
                return eventDate.toDateString() === day.toDateString(); 
            });
            
            // For template, we only save the first event for that day to keep it simple
            const eventToTemplate = eventsForDay[0]; 

            currentWeekEvents.push({
                day: DAYS[i],
                title: eventToTemplate?.title || '', 
                // Time must be 24hr format for the input type="time"
                time: eventToTemplate?.start ? new Date(eventToTemplate.start).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}) : '00:00',
                duration: eventToTemplate?.duration ? eventToTemplate.duration / 60 : 24, // Convert minutes to hours
                timeZone: eventToTemplate?.timeZone || 'local',
                categoryId: eventToTemplate?.categoryId || eventTypes[0]?.id || '',
            });
        }
        
        setEditingTemplate(null); 
        setTemplateName(`Week Template - ${new Date().toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`);
        setWeekEvents(currentWeekEvents);
    };

    return (
        <div className="space-y-4">
            <h4 className="font-bold text-md border-b pb-2 flex justify-between items-center">
                Weekly Templates for: {activeSite}
                {canEdit && <Button variant="secondary" onClick={handleSaveFromCalendar} className="text-xs py-1">Save Current Week</Button>}
            </h4>
            
            {/* Template List */}
            <div className="max-h-36 overflow-y-auto space-y-2 border-b pb-4">
                {templates.map(t => (
                    <div key={t.id} className="flex justify-between items-center p-2 border rounded bg-white text-sm">
                        <span className="font-semibold">{t.name}</span>
                        <div className="flex gap-2">
                            {/* Call onApply here */}
                            {canEdit && <Button variant="secondary" className="text-xs py-1 bg-green-50 text-green-700 hover:bg-green-100" onClick={() => onApply(t)}>Apply</Button>}
                            <Button variant="secondary" className="text-xs py-1" onClick={() => setEditingTemplate(t)}>Edit</Button>
                            <Button variant="danger" className="text-xs py-1" onClick={() => onDelete(t.id)}>Delete</Button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Template Edit/Creation Form */}
            <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg border space-y-4">
               
                <Input
                    label="Template Name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    required
                />
                
                <h5 className="font-semibold text-sm pt-2">Week Schedule</h5>
                
                <div className="space-y-3 max-h-60 overflow-y-auto">
                    {weekEvents.map((evt, index) => (
                        <div key={evt.day} className="grid grid-cols-12 gap-2 items-center text-xs p-2 border rounded bg-white">
                            <label className="col-span-2 font-medium">{evt.day}</label>
                            
                            {/* Title */}
                            <div className="col-span-3">
                                <Input
                                    value={evt.title}
                                    onChange={(e) => handleFieldChange(index, 'title', e.target.value)}
                                    placeholder="Event Title"
                                />
                            </div>

                            {/* Time */}
                            <div className="col-span-2">
                                <Input
                                    type="time"
                                    value={evt.time}
                                    onChange={(e) => handleFieldChange(index, 'time', e.target.value)}
                                />
                            </div>

                            {/* Duration */}
                            <div className="col-span-2">
                                <Input
                                    type="number"
                                    min="0.5"
                                    step="0.5"
                                    value={evt.duration}
                                    onChange={(e) => handleFieldChange(index, 'duration', parseFloat(e.target.value))}
                                />
                            </div>
                            
                            {/* Category */}
                            <div className="col-span-3">
                                <Select
                                    value={evt.categoryId || ''}
                                    onChange={(e) => handleFieldChange(index, 'categoryId', parseInt(e.target.value))}
                                    options={eventTypes.map(t => ({ value: t.id, label: t.name }))}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => setEditingTemplate(null)}>Cancel</Button>
                    <Button type="submit" variant="primary">Save Template</Button>
                </div>
            </form>
        </div>
    );
};

export default TemplateManager;