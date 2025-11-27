import React, { useState, useEffect, useCallback } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  updatePassword // Imported for password updates
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  Timestamp, 
  getDoc,
} from 'firebase/firestore';
import { 
  Calendar as CalendarIcon, 
  Settings, 
  LogOut, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  MapPin,
  Clock,
  Tag,
  X,
  Search, 
  Trash2, 
  Key, // New icon for password
  // --- Icons for War Game Theme ---
  Shield, 
  Sword, 
  Target, 
  Eye, 
  Castle, 
  Flag, 
  User, 
  Anchor, 
  Bolt, 
  Sprout, 
  Zap, 
} from 'lucide-react';

// --- IMPORT FIREBASE SERVICES ---
import { auth, db, APP_DATA_ID } from './firebaseConfig';
// --------------------------------
// --- IMPORT EXTERNAL COMPONENTS ---
import TemplateManager from './TemplateManager'; 
// ----------------------------------

// --- Constants ---
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];



// --- SITE NAME & ADMIN FEATURE CONSTANTS ---
const DEFAULT_SITE_NAME = 'Calendar'; 

const WAR_ICONS = {
    '— No Icon —': null,
    Shield: Shield, // Defense
    Sword: Sword, // Attack/Rally
    Target: Target, // Objective
    Eye: Eye, // Scout/Watch
    Castle: Castle, // Tower/Base
    Flag: Flag, // Capture/Event
    Anchor: Anchor, // Siege
    Bolt: Bolt, // Speed/Rush
    Sprout: Sprout, // Growth/Farm
    Zap: Zap, // Energy/Power
};


const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();


// --- Utility Functions ---

// Calculates time difference and formats it compactly
const getTimeDifference = (targetTime) => {
    const now = new Date();
    const target = new Date(targetTime);
    const diffMs = target.getTime() - now.getTime();

    if (diffMs < 0) return 'Passed'; 

    const diffSeconds = Math.floor(diffMs / 1000);
    const s = diffSeconds % 60;
    const m = Math.floor(diffSeconds / 60) % 60;
    const h = Math.floor(diffSeconds / 3600) % 24;
    const d = Math.floor(diffSeconds / 86400);

    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
};


// --- formatTime FUNCTION (Global time for sidebar/modals) 
  const formatTime = (dateStr, mode = 'local', isCurrentTime, appSettings) => {
    let date
    if (isCurrentTime) {
         date = new Date();
    } else {
        date = new Date(dateStr);
    }
    
    if (mode === 'server') { 
      // Defensive Check & Fallback
      if (!appSettings || typeof appSettings.serverOffset === 'undefined') {
          console.error("formatTime called with mode 'server' but appSettings or serverOffset is missing. Falling back to local mode.");
          mode = 'local'; // Fallback to local time
      } 
      
      // If mode is still 'server', proceed with server time calculation
      if (mode === 'server') {
        const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
        const serverTime = new Date(utc + (3600000 * appSettings.serverOffset));
      
        // Server Time: HH:MM:SS (24hr format) for current time in sidebar
        if (isCurrentTime)
         return serverTime.toLocaleTimeString('en-GB', {
              hour: '2-digit', 
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            });
        
        
        // Server Time: HH:MM (24hr format) for upcoming events
        return serverTime.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
      }
    }
    
    // Local Time: hh:mm AM/PM (12hr format). This is also the fallback for 'server' errors.
    return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
    });
  };
// ------------------------------------------------------------------

/**
 * Generates future event instances from recurring events (rrule)
 * and combines them with non-recurring events.
 */
const generateUpcomingEvents = (events, lookaheadDays = 30) => {
    const now = new Date();
    const lookahead = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);
    const generatedEvents = [];

    events.forEach(event => {
        const start = new Date(event.start);
        
        // 1. Handle non-recurring and future events
        if (!event.recurrence || event.recurrence === 'none') {
            if (start > now) {
                generatedEvents.push({ ...event, start: start.toISOString() });
            }
            return;
        }

        // 2. Handle recurring events
        const repeatsUntil = event.repeatsUntil ? new Date(event.repeatsUntil) : lookahead;
        
        // Determine the period to check (up to the repeatsUntil date or lookahead limit)
        const checkUntil = repeatsUntil < lookahead ? repeatsUntil : lookahead;
        
        // Start checking from the event's start date or 'now', whichever is later
        let current = start > now ? new Date(start) : new Date(now);
        current.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
        
        // Ensure that for comparison, 'current' is always at the original event's time
        const originalTimeHours = start.getHours();
        const originalTimeMinutes = start.getMinutes();
        const originalTimeSeconds = start.getSeconds();
        const originalTimeMilliseconds = start.getMilliseconds();
        const startDayOfWeek = start.getDay();
        const startDayOfMonth = start.getDate();
        
        // If current time is in the middle of a recurring period (e.g., today is Tuesday, event is Monday weekly)
        // We need to jump to the next matching date.
        
        const advanceDate = (date, recurrenceType) => {
            if (recurrenceType === 'daily') {
                date.setDate(date.getDate() + 1);
            } else if (recurrenceType === 'weekly') {
                date.setDate(date.getDate() + 7);
            } else if (recurrenceType === 'monthly') {
                date.setMonth(date.getMonth() + 1);
            }
            // Reset time to original event time after advancing the date
            date.setHours(originalTimeHours, originalTimeMinutes, originalTimeSeconds, originalTimeMilliseconds);
            return date;
        };

        // If the current date is before the original start date, start at the original start date.
        if (current < start) {
            current = new Date(start);
        }

        // Adjust 'current' to the next actual recurrence date if it falls in a past/invalid date
        let isMatch = false;
        
        // Check for the first match, advancing date if needed, up to 30 days
        for(let i=0; i<lookaheadDays+1 && current <= checkUntil; i++) {
             const currentDate = new Date(current);
             const currentDayOfWeek = currentDate.getDay();
             const currentDayOfMonth = currentDate.getDate();

             let checkMatch = false;
             
             if (event.recurrence === 'daily') {
                 checkMatch = true;
             } else if (event.recurrence === 'weekly') {
                 checkMatch = (currentDayOfWeek === startDayOfWeek);
             } else if (event.recurrence === 'monthly') {
                 checkMatch = (currentDayOfMonth === startDayOfMonth);
             }

             if (checkMatch && currentDate > now) {
                 isMatch = true; // Found the next event instance
                 break;
             }
             
             // If no match yet, advance date based on recurrence logic
             current = advanceDate(current, event.recurrence);
             
             if (current > checkUntil) break;
        }

        if (isMatch) {
            // Found the first instance (in the 'current' variable). Now, generate subsequent instances.
            while (current <= checkUntil) {
                generatedEvents.push({
                    ...event,
                    id: `${event.id}-${current.getTime()}`, 
                    start: current.toISOString(), 
                    isRecurringInstance: true,
                });
                
                // Move to the next instance
                current = advanceDate(current, event.recurrence);
            }
        }
    });

    // Sort all generated instances by start time
    return generatedEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
};
       
    
// Function to convert hex to rgb (needed for background opacity)
const hexToRgb = (hex) => {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
};


// --- Components (Button, Modal, Input, Select, UpcomingEvents) ---
const Button = ({ children, onClick, variant = 'primary', className = '', ...props }) => {
  const base = "px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1";
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500", // Changed to indigo for theme
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 focus:ring-red-500",
    ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
  };
 
  // Ensure the entire button element is on one logical return line or wrapped in ()
  return (
    <button onClick={onClick} className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};


const Input = ({ label, containerClassName = '', ...props }) => (
  <div className={`mb-4 ${containerClassName}`}> 
    {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
    <input className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none transition-all" {...props} />
  </div>
);


const Select = ({ label, children, ...props }) => (
  <div className="mb-4">
    {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
    <select className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white" {...props}>
      {children}
    </select>
  </div>
);

export { Button, Input, Select, DAYS };

// Function to calculate end time (Moved outside of UpcomingEvents for general use)
const calculateEndTime = (startStr, durationMinutes) => {
    if (!startStr || !durationMinutes) return '';
    return new Date(new Date(startStr).getTime() + durationMinutes * 60000);
}



// IconComponent function to generate the SVG content for the faint background
const getSvgContent = (IconComponent, iconColor) => {
  // NOTE: Creating the component here for the SVG content, as it's outside the main component's render loop
  const iconElement = IconComponent({size: 96, color: iconColor, strokeWidth: 0.5});
  let svgContent;
  
  if (Array.isArray(iconElement.props.children)) {
      // Grab the first child's content (usually the main path)
      svgContent = iconElement.props.children[0]; 
  } else {
      // Handle simple icons that might just return the path directly
      svgContent = iconElement.props.children;
  }
  
  // Convert JSX element (which has type='path', etc.) to a string
  // This is a common pattern in StackBlitz/Vite JSX environments where `iconElement.props.children`
  // holds the string content for the SVG path/group element.
  if (typeof svgContent === 'object' && svgContent !== null) {
      const { type, props } = svgContent;
      const attributes = Object.keys(props).map(key => `${key}="${props[key]}"`).join(' ');
      svgContent = `<${type} ${attributes}/>`;
  }
  
  return svgContent;
};

// --- RECURRING EVENT MANAGER COMPONENT (NEW) ---
// -----------------------------------------------------------
const RecurringEventManager = ({ recurringEventsList, onEdit, onDelete, formatTime }) => {
    return (
        <div className="space-y-4">
            <h4 className="font-bold text-lg mb-2">Active Recurring Events ({recurringEventsList.length})</h4>
            <div className="max-h-96 overflow-y-auto border rounded-lg bg-white p-3 space-y-2">
                <div className="grid grid-cols-6 font-bold text-xs text-gray-500 pb-1 border-b">
                    <span className="col-span-2">Title</span>
                    <span className="col-span-1">Recurrence</span>
                    <span className="col-span-2">Starts / Repeats Until</span>
                    <span className="col-span-1">Actions</span>
                </div>
                {recurringEventsList.map(evt => (
                    <div key={evt.id} className="grid grid-cols-6 text-sm py-2 border-b last:border-b-0 items-center">
                        <span className="col-span-2 font-medium truncate">{evt.title}</span>
                        <span className="col-span-1 capitalize text-xs text-indigo-600">{evt.recurrence}</span>
                        <div className="col-span-2 text-xs text-gray-600 space-y-0.5">
                            <p>{new Date(evt.start).toLocaleDateString()} {formatTime(evt.start, 'local', false, { serverOffset: 0 })}</p>
                            <p className="text-red-500">Until: {evt.repeatsUntil ? new Date(evt.repeatsUntil).toLocaleDateString() : 'Forever'}</p>
                        </div>
                        <div className="col-span-1 flex gap-1">
                            <Button variant="secondary" className="text-xs p-1" onClick={() => onEdit(evt)}>Edit</Button>
                            <Button variant="danger" className="text-xs p-1" onClick={() => onDelete(evt.id)}><Trash2 size={12}/></Button>
                        </div>
                    </div>
                ))}
                {recurringEventsList.length === 0 && <div className="text-center text-gray-400 py-4">No recurring events found.</div>}
            </div>
        </div>
    );
};


// --- START OF UpcomingEvents COMPONENT ---

const UpcomingEvents = ({ events, categories, formatTime, setActiveEvent, displayMode, max = 5, filterPriority = null, WAR_ICONS, CalendarIcon, formatTimeDifference, getEndTime, getSvgContent, hexToRgb, appSettings }) => {
    
    // 1. Generate all upcoming events, including recurring instances (using the new utility)
    let upcoming = generateUpcomingEvents(events, 30); // Look ahead 30 days
    
    // 2. Take only the first 'max' (default is 5) events
    upcoming = upcoming.slice(0, max);
    
    // Filter by priority if set (e.g., for the 'Important' tab)
    if (filterPriority !== null) {
        upcoming = upcoming.filter(evt => {
            const cat = categories.find(c => c.id === evt.categoryId);
            return (cat?.priority || 2) === filterPriority; // Default to 2 if priority is missing
        });
    }

    return (
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex justify-between items-center">
          <span>{filterPriority === 3 ? 'Important Operations' : 'Upcoming Events'}</span>
        </h3>
        
        {upcoming.length > 0 ? (
          <div className="space-y-3">
            {upcoming.map(evt => {
              const cat = categories.find(c => c.id === evt.categoryId);
              
              // If it's a recurring instance, we need the original event object for editing
              // We split the ID: original ID is before the first hyphen
              const originalEventId = evt.isRecurringInstance ? evt.id.split('-')[0] : evt.id;
              
              const eventToSelect = evt.isRecurringInstance ? events.find(e => e.id === originalEventId) : evt;

              const endTime = calculateEndTime(evt.start, evt.duration);
             
              const iconName = evt.icon || cat?.icon || null;
              
              const IconComponent = iconName ? WAR_ICONS[iconName] : null; 
              
              const iconColor = evt.iconColor || cat?.iconColor || cat?.color || '#6366f1';
              
              let faintBgStyle = {};
              
              // Define the border color variable
              const borderColor = evt.color || cat?.color || '#6366f1';
              
              // Calculate background image style (if needed)
              if (IconComponent) {
                  try {
                      const svgContent = getSvgContent(IconComponent, iconColor);
                      faintBgStyle = { 
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E${encodeURIComponent(svgContent)}%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right -10px bottom -10px',
                          backgroundSize: '80px',
                          // Background color is handled by the main CSS class (bg-white)
                      };
                  } catch (e) {
                      console.error("Error generating SVG background:", e);
                  }
              }
              // ---------------------------------------------------------------------

              return (
                <button
                  key={evt.id} 
                  onClick={() => setActiveEvent(eventToSelect)} 
                  // UPDATED CLASS: bg-white and border-2 for white card with visible border
                  className="relative w-full text-left p-3 rounded-lg border-2 bg-white transition-colors overflow-hidden" 
                  style={{
                      // Set the dynamic border color
                      borderColor: borderColor, 
                      // Spread background image styles (if present)
                      ...faintBgStyle,
                  }}>


                    {/* Dynamic Time Until Start */}
                    <div className="text-xs font-bold text-red-600 uppercase mb-1 flex justify-between items-center">
                        <span>Starts In: {getTimeDifference(evt.start)}</span> 
                        
                        {/* Only render the icon if IconComponent is valid */}
                        {IconComponent && <IconComponent size={14} style={{ color: iconColor }} />}
                        
                    </div>

                    {/* Event Title */}
                    <div className="text-sm font-bold text-gray-800 truncate mb-1">{evt.title} {evt.isRecurringInstance && <span className="text-xs text-indigo-500 font-normal">(Rec.)</span>}</div>
                    
                    {/* Date, Start Time, End Time */}
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                        {/* Using CalendarIcon which is passed in/imported */}
                        {CalendarIcon && <CalendarIcon size={12}/>} 
                        <span>
                            {new Date(evt.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' '}
                            {/* NOTE: Passing appSettings here is important for server mode */}
                            {formatTime(evt.start, displayMode, false, appSettings)} 
                            {' - '}
                            {formatTime(endTime.toISOString(), displayMode, false, appSettings)}
                        </span>
                    </div>

                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-400 italic">No upcoming events.</div>
        )}
      </div>
    );
  };
// --- END OF UpcomingEvents COMPONENT ---

// Place this near the top of your file, outside of the main CalendarApp function
const AccessSettingsTab = ({ user, userEditMessage, handleUpdatePassword }) => (
    <>
        <h4 className='font-bold text-md border-b pb-2 mb-4 flex items-center gap-2'><Key size={18}/> Access Settings</h4>
          
        {/* Email Display */}
        <div className='bg-gray-50 p-3 rounded-lg border flex justify-between items-center mb-4'>
            <span className='text-sm font-medium text-gray-700'>Email:</span>
            <span className='font-mono text-sm text-gray-800'>{user?.email || 'N/A'}</span>
        </div>

        {/* Password Update Form */}
        <form onSubmit={handleUpdatePassword} className='p-4 border rounded-lg space-y-3 bg-red-50'>
            <h5 className='text-sm font-bold text-red-700'>Update Password</h5>
            <Input name="newPassword" type="password" label="New Password" placeholder="Enter new password (min 6 characters)" required />
            <Button type="submit" variant="danger" className="w-full">Update Password</Button>
            <p className='text-xs text-red-600 mt-2'>Note: For security, Firebase requires you to log in recently before updating your password.</p>
        </form>
    </>
);



// --- Main Application ---
export default function CalendarApp() {
  // Auth State
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null); 
  const [authView, setAuthView] = useState('code'); 
  const [inviteCode, setInviteCode] = useState('');
  const [pendingContext, setPendingContext] = useState(null); 


  // App State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [eventTypes, setEventTypes] = useState([]); 
  const [appSettings, setAppSettings] = useState({ serverOffset: 0, currentSeason: 1 });
  const [displayMode, setDisplayMode] = useState('local');
  const [sidebarTab, setSidebarTab] = useState('upcoming'); 
  const [activeSite, setActiveSite] = useState(null);
  const [availableSites, setAvailableSites] = useState([]);



  // Admin Data
  const [inviteCodes, setInviteCodes] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState(''); 
  const [sortUserKey, setSortUserKey] = useState('planetNumber'); 
  const [templates, setTemplates] = useState([]); 
  const [activityLog, setActivityLog] = useState([]); 


  // UI State
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [adminTab, setAdminTab] = useState('codes');
  const [editingType, setEditingType] = useState(null); 
  const [isUserEditModalOpen, setIsUserEditModalOpen] = useState(false); 
  const [userEditMessage, setUserEditMessage] = useState({ type: null, text: '' }); // For password updates
  const [profileTab, setProfileTab] = useState('general');

  // --- LOGGING UTILITY ---
  const logAction = useCallback(async (actionType, details) => {
    if (!user || !userData) return;
    try {
        const logRef = collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'activityLog');
        await addDoc(logRef, {
            timestamp: new Date().toISOString(),
            userId: user.uid,
            userName: userData.displayName || user.email,
            site: activeSite,
            role: userData.role,
            actionType, 
            details: JSON.stringify(details),
        });
    } catch (error) {
        console.error("Error writing to activity log:", error);
    }
  }, [user, userData, activeSite]);


  // --- DATA INITIALIZATION LOGIC ---
  const initializeUserData = useCallback(async (userId, displayName) => {
    const userProfileRef = doc(db, 'artifacts', APP_DATA_ID, 'users', userId, 'profile', 'data');
    const userSnap = await getDoc(userProfileRef);

    if (!userSnap.exists()) {
      console.log("User data does not exist. Creating default paths and data.");
      
      // Check if this is the very first user (no users in the directory yet)
      const userDirRef = collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'userDirectory');
      const userDirSnap = await getDocs(userDirRef);
      const initialRole = userDirSnap.empty ? 'admin' : 'user';

      // A. Create the main User Profile document
      await setDoc(userProfileRef, {
        displayName: displayName || 'New User',
        email: user?.email,
        createdAt: Timestamp.fromDate(new Date()),
        role: initialRole, // Use the determined role (admin if first user)
        site: DEFAULT_SITE_NAME, 
        customColor: '#3b82f6', 
        discordUsername: '', // Default discord field
      });

      // B. Create the User Directory entry
      await setDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'userDirectory', userId), {
        displayName: displayName || 'New User',
        role: initialRole, // Use the determined role
        site: DEFAULT_SITE_NAME, 
        uid: userId,
        planetNumber: '', 
        alliance: '',
        customColor: '#3b82f6',
        discordUsername: '', // Default discord field
      });

      // C. Create the initial global settings document (if it doesn't exist)
      const settingsRef = doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'settings', 'config');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
          await setDoc(settingsRef, { serverOffset: 0, currentSeason: 1 });
      }

      // D. Create a base category (if it doesn't exist for the DEFAULT_SITE_NAME site)
      const catQuery = query(collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'categories'), where("site", "==", DEFAULT_SITE_NAME));
      const catSnap = await getDocs(catQuery);
      if (catSnap.empty) {
          await addDoc(collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'categories'), {
              name: 'General', 
              color: '#6366f1', 
              labelColor: '#ffffff',
              icon: 'Shield', // Default icon for the base category
              iconColor: '#6366f1',
              site: DEFAULT_SITE_NAME,
              priority: 2, 
              actions: [ 
                { label: 'Rally', icon: 'Sword', color: '#ff0000' },
              ]
          });
      }
      
      console.log("All default collections and documents have been created.");
    }
  }, [user]);


  // --- 1. Auth & Profile Load ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        initializeUserData(currentUser.uid, currentUser.displayName); 
      } else {
        setUserData(null);
        setActiveSite(null);
        setAuthView('code');
      }
    });
    return unsubscribe;
  }, [initializeUserData]); 

  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'artifacts', APP_DATA_ID, 'users', user.uid, 'profile', 'data');
    const unsub = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserData(data);
        if (!activeSite) {
            setActiveSite(data.site || DEFAULT_SITE_NAME);
        }
      }
    }, (error) => console.error("User Profile Error:", error));
    return unsub;
  }, [user, activeSite]); // Depend on activeSite to refresh data when it changes


  // --- 2. Data Sync (Constrained by activeSite) ---
  useEffect(() => {
    if (!user || !activeSite) return;

    // Events Sync: Query constrained by activeSite
    const eventsRef = collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'events');
    const qEvents = query(eventsRef, where("site", "==", activeSite));
    const unsubEvents = onSnapshot(qEvents, (snapshot) => {
      setEvents(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Auth/Permission Error (Events):", error));


    // Categories Sync: Query constrained by activeSite
    const catsRef = collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'categories');
    const qCats = query(catsRef, where("site", "==", activeSite));
    const unsubCats = onSnapshot(qCats, (snapshot) => {
      const loadedCats = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setEventTypes(loadedCats.sort((a,b) => (b.priority || 0) - (a.priority || 0)));
    });

    // Templates Sync: Query constrained by activeSite
    const templatesRef = collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'templates');
    const qTemplates = query(templatesRef, where("site", "==", activeSite));
    const unsubTemplates = onSnapshot(qTemplates, (snapshot) => {
        setTemplates(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    // Activity Log Sync: Query constrained by activeSite
    const logRef = collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'activityLog');
    const qLog = query(logRef, where("site", "==", activeSite)); 
    const unsubLog = onSnapshot(qLog, (snapshot) => {
        setActivityLog(snapshot.docs.map(d => ({ id: d.id, ...d.data(), details: JSON.parse(d.data().details) })));
    });


    // Settings Sync (Global)
    const settingsRef = doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'settings', 'config');
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) setAppSettings(docSnap.data());
    });


    return () => {
      unsubEvents();
      unsubCats();
      unsubSettings();
      unsubTemplates();
      unsubLog();
    };
  }, [user, activeSite]);


  // --- 3. Admin Data (Not constrained by activeSite, needs all data) ---
  useEffect(() => {
    if (!userData || userData.role !== 'admin') return;

    const codesRef = collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'inviteCodes');
    const unsubCodes = onSnapshot(codesRef, (snap) => {
      const codes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInviteCodes(codes);
      const sites = new Set([DEFAULT_SITE_NAME]); 
      codes.forEach(c => c.site && sites.add(c.site));
      setAvailableSites(Array.from(sites));
    });


    const usersRef = collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'userDirectory');
    const unsubUsers = onSnapshot(usersRef, (snap) => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });


    return () => {
      unsubCodes();
      unsubUsers();
    };
  }, [userData]);


  // --- Actions ---

  const handleValidateCode = async () => {
    const codeQuery = query(collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'inviteCodes'), where("code", "==", inviteCode), where("status", "==", "active"));
    try {
        const snapshot = await getDocs(codeQuery);
        if (snapshot.empty) {
            alert("Invalid or expired invite code.");
            return;
        }
        
        const codeDoc = snapshot.docs[0];
        const codeData = codeDoc.data();

        if (codeData.usesRemaining !== null && codeData.usesRemaining !== undefined && codeData.usesRemaining <= 0) {
             alert("Invite code has no uses remaining.");
             return;
        }

        setPendingContext({
            codeId: codeDoc.id,
            role: codeData.role,
            site: codeData.site || DEFAULT_SITE_NAME,
            usesRemaining: codeData.usesRemaining,
        });
        setAuthView('signup');

    } catch (e) {
        console.error("Code validation error:", e);
        alert("An error occurred during code validation.");
    }
  };


  const handleAuth = async (e, mode) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    
    const name = e.target.name?.value || email.split('@')[0];
    const planetNumber = e.target.planetNumber?.value || '';
    const alliance = e.target.alliance?.value || ''; 
    const discordUsername = e.target.discordUsername?.value || '';
    const customColor = '#3b82f6';

    try {
      if (mode === 'signup') {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        const userId = res.user.uid;
        const userProfile = {
          email,
          displayName: name,
          role: pendingContext.role,
          site: pendingContext.site,
          uid: userId,
          planetNumber: planetNumber, 
          alliance: alliance, 
          discordUsername: discordUsername, 
          customColor: customColor,
        };

        // 1. Create User Profile
        await setDoc(doc(db, 'artifacts', APP_DATA_ID, 'users', userId, 'profile', 'data'), userProfile);
        // 2. Create Directory Entry
        await setDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'userDirectory', userId), userProfile);

        // 3. Update the invite code
        if (pendingContext?.codeId) {
           const codeRef = doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'inviteCodes', pendingContext.codeId);
           const codeSnap = await getDoc(codeRef);
           
           if (codeSnap.exists()) {
               const codeData = codeSnap.data();
               // Decrement usesRemaining if it's defined and greater than 0
               const usesRemaining = (codeData.usesRemaining !== undefined && codeData.usesRemaining !== null) ? Math.max(0, codeData.usesRemaining - 1) : null;
               
               const updateData = {
                   usesRemaining: usesRemaining,
                   status: (usesRemaining !== null && usesRemaining <= 0) ? 'used' : 'active', 
                   lastUsedBy: userId,
                   lastUsedAt: new Date().toISOString()
               };
               await updateDoc(codeRef, updateData);
           }
        }
        
        await logAction('USER_SIGNUP', { email, name, role: pendingContext.role, site: pendingContext.site });

      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      alert(err.message);
    }
  };


  const handleUpdateUserProfile = async (e) => {
      e.preventDefault();
      setUserEditMessage({ type: null, text: '' }); // Clear any previous messages
      const displayName = e.target.displayName.value;
      const planetNumber = e.target.planetNumber.value;
      const alliance = e.target.alliance.value;
      const customColor = e.target.customColor.value;
      const discordUsername = e.target.discordUsername.value; // Get new field

      const updateData = {
          displayName,
          planetNumber,
          alliance,
          customColor,
          discordUsername // Include new field
      };
      
      try {
          const userRef = doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'userDirectory', user.uid);
          const userProfileRef = doc(db, 'artifacts', APP_DATA_ID, 'users', user.uid, 'profile', 'data');

          await updateDoc(userRef, updateData);
          await updateDoc(userProfileRef, updateData);

          logAction('USER_PROFILE_UPDATE', { displayName, planetNumber, customColor });
          setUserEditMessage({ type: 'success', text: 'Profile updated successfully!' });
      } catch (error) {
          console.error("Error updating user profile:", error);
          setUserEditMessage({ type: 'error', text: 'Failed to update profile.' });
      }
  };
  
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setUserEditMessage({ type: null, text: '' });
    const newPassword = e.target.newPassword.value;
    
    if (!newPassword || newPassword.length < 6) {
        setUserEditMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
        return;
    }
    
    try {
        await updatePassword(auth.currentUser, newPassword);
        logAction('USER_PASSWORD_UPDATE', { userId: user.uid });
        e.target.reset();
        setUserEditMessage({ type: 'success', text: 'Password updated successfully! You may need to log in again.' });
    } catch (error) {
        // Most common error is 'auth/requires-recent-login'
        let errorMessage = "Failed to update password. Did you recently log in? (Requires recent login for security)";
        if (error.code === 'auth/requires-recent-login') {
            errorMessage = "Password update requires re-authentication. Please log out and log back in, then try again.";
        }
        console.error("Error updating password:", error);
        setUserEditMessage({ type: 'error', text: errorMessage });
    }
  };


  // --- FIX: Updated handleSaveEvent to include icon and iconColor ---
  const handleSaveEvent = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const date = formData.get('date');
    const time = formData.get('time');
    const timeZone = formData.get('timeZone');
    const durationMinutes = parseInt(formData.get('duration')) * 60;
    
    // Combine date and time to create a local ISO string
    let eventStart = `${date}T${time}:00`; 

    let startTimestamp;

    if (timeZone === 'server') {
        // 1. Create a local Date object based on the user's input time.
        const localDate = new Date(eventStart);
        
        // 2. Calculate the difference (in minutes) between local time and UTC.
        const localOffsetMinutes = localDate.getTimezoneOffset();

        // 3. Convert the local Date to UTC.
        const utcTime = localDate.getTime() + (localOffsetMinutes * 60000);

        // 4. Apply the application's server offset (in minutes).
        // appSettings is guaranteed to be defined in component state.
        const serverOffsetMinutes = appSettings.serverOffset * 60;
        
        // 5. Adjust the UTC time to match the target server time.
        const targetServerTime = new Date(utcTime - (serverOffsetMinutes * 60000));
        
        // Use the ISO string format which is always UTC (Z suffix)
        startTimestamp = targetServerTime.toISOString();
        
    } else {
        // Local time input is simply converted to UTC/ISO string
        startTimestamp = new Date(eventStart).toISOString();
    }
    
    const selectedIconName = formData.get('icon');
    const selectedIconColor = formData.get('iconColor');


    const eventData = {
        title: formData.get('title'),
        start: startTimestamp,
        duration: durationMinutes, // Stored in minutes
        timeZone: timeZone, // 'local' or 'server'
        categoryId: formData.get('category'),
        recurrence: formData.get('recurrence'),
        repeatsUntil: formData.get('repeatsUntil') || null,
        
        // New Icon Fields
        icon: selectedIconName === '— No Icon —' ? null : selectedIconName,
        iconColor: selectedIconColor,

        // CRITICAL: Must include site for Firestore security rules
        site: activeSite, 
        createdBy: user.uid,
        updatedAt: new Date().toISOString(),
    };

    try {
        if (selectedEvent) {
            // Update existing event
            const eventRef = doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'events', selectedEvent.id);
            await updateDoc(eventRef, eventData);
            logAction('EVENT_UPDATE', { eventId: selectedEvent.id, title: eventData.title, site: activeSite });
        } else {
            // Create new event
            await addDoc(collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'events'), eventData);
            logAction('EVENT_CREATE', { title: eventData.title, site: activeSite });
        }
        setIsEventModalOpen(false);
        setSelectedEvent(null);
    } catch (error) {
        console.error("Error saving event:", error);
        alert(`Failed to save event. Check console for details. (If you are not an Admin/Leader, check if the active site is correct.)`);
    }
  };
  
  const handleDeleteEvent = async (eventId) => {
    if (window.confirm("Are you sure you want to delete this event?")) {
        try {
            await deleteDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'events', eventId));
            logAction('EVENT_DELETE', { eventId: eventId, title: selectedEvent?.title || 'Unknown Event', site: activeSite });
            setIsEventModalOpen(false);
            setSelectedEvent(null);
        } catch (error) {
            console.error("Error deleting event:", error);
            alert("Failed to delete event.");
        }
    }
  }


  // --- TEMPLATE ACTIONS ---
  const handleSaveWeekTemplate = async (templateData) => {
    try {
        const dataToSave = {
            ...templateData,
            site: activeSite,
            updatedAt: new Date().toISOString(),
        };
        if (templateData.id) {
            await updateDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'templates', templateData.id), dataToSave);
            logAction('TEMPLATE_UPDATE', { templateId: templateData.id, name: templateData.name, site: activeSite });
        } else {
            await addDoc(collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'templates'), dataToSave);
            logAction('TEMPLATE_CREATE', { name: templateData.name, site: activeSite });
        }
        alert(`Template "${templateData.name}" saved successfully!`);
    } catch (error) {
        console.error("Error saving template:", error);
        alert("Failed to save template.");
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (window.confirm("Are you sure you want to delete this template?")) {
        try {
            await deleteDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'templates', id));
            logAction('TEMPLATE_DELETE', { templateId: id, site: activeSite });
        } catch (error) {
            console.error("Error deleting template:", error);
            alert("Failed to delete template.");
        }
    }
  };


// --- Place this in your App.jsx, alongside your other handler functions ---
const handleApplyTemplate = async (template) => {
    try {
        const templateEvents = template.events;
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 (Sunday) to 6 (Saturday)
        const startOfWeek = new Date(today);
        
        // Calculate the date for the previous Sunday (start of the current week)
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0); // Reset time to midnight for accurate day calculation

        let successCount = 0;

        for (const templateEvent of templateEvents) {
            if (templateEvent.title.trim() === '') continue; // Ignore empty events
            
            const dayIndex = DAYS.indexOf(templateEvent.day);
            if (dayIndex === -1) continue; 
            
            const timeZone = templateEvent.timeZone || 'local'; // Default to local
            const [hour, minute] = templateEvent.time.split(':').map(Number);

            // Calculate the specific full date for the event
            const targetDate = new Date(startOfWeek);
            targetDate.setDate(startOfWeek.getDate() + dayIndex); 
            targetDate.setHours(hour, minute, 0, 0);

            let startTimestamp;

            // Apply Time Zone Logic from handleSaveEvent
            if (timeZone === 'server') {
                const localOffsetMinutes = targetDate.getTimezoneOffset();
                const utcTime = targetDate.getTime() + (localOffsetMinutes * 60000);
                // appSettings is guaranteed to be defined in component state.
                const serverOffsetMinutes = appSettings.serverOffset * 60; 
                const targetServerTime = new Date(utcTime - (serverOffsetMinutes * 60000));
                startTimestamp = targetServerTime.toISOString();
            } else {
                startTimestamp = targetDate.toISOString();
            }

            const cat = eventTypes.find(c => c.id === templateEvent.categoryId);
            
            const eventData = {
                title: templateEvent.title,
                start: startTimestamp,
                duration: templateEvent.duration * 60, // Convert hours to minutes
                timeZone: timeZone, 
                categoryId: templateEvent.categoryId,
                recurrence: 'none', // Templates create non-recurring instances
                repeatsUntil: null, 
                icon: cat?.icon || null, // Inherit icon from category
                iconColor: cat?.iconColor || cat?.color || '#000000', // Inherit color
                site: activeSite, 
                createdBy: user.uid,
                updatedAt: new Date().toISOString(),
            };

            await addDoc(collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'events'), eventData);
            successCount++;
        }
        
        logAction('TEMPLATE_APPLY', { templateName: template.name, newEventCount: successCount, site: activeSite });
        alert(`Successfully created ${successCount} event(s) from template "${template.name}"!`);

    } catch (error) {
        console.error("Error applying template:", error);
        alert("Failed to apply template. Check console for details.");
    }
  };


  // --- ADMIN ACTIONS ---
  const createInviteCode = async (e) => {
    e.preventDefault();
    const siteName = e.target.siteName.value;
    const role = e.target.role.value;
    const maxUses = parseInt(e.target.maxUses.value);
    
    try {
        const newCode = generateCode();
        await addDoc(collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'inviteCodes'), {
            code: newCode,
            role: role,
            site: siteName,
            maxUses: isNaN(maxUses) ? null : maxUses, 
            usesRemaining: isNaN(maxUses) ? null : maxUses,
            status: 'active',
            createdAt: new Date().toISOString(),
        });
        logAction('INVITE_CODE_CREATE', { code: newCode, role, site: siteName, maxUses });
        alert(`Code created: ${newCode}`);
    } catch (error) {
        console.error("Error creating code:", error);
        alert("Failed to create invite code.");
    }
  };

  const handleSaveEventType = async (e) => {
      e.preventDefault();
      const id = editingType?.id;
      const name = e.target.typeName.value;
      const color = e.target.typeColor.value;
      const labelColor = e.target.typeLabelColor.value;
      const priority = parseInt(e.target.typePriority.value);
      const iconName = e.target.typeIcon.value;
      const iconColor = e.target.typeIconColor.value;
      
      const catData = {
          name,
          color,
          labelColor,
          priority,
          icon: iconName === '— No Icon —' ? null : iconName,
          iconColor: iconColor,
          site: activeSite,
          actions: editingType?.actions || [], // Persist existing actions
      };

      try {
          if (id) {
              await updateDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'categories', id), catData);
              logAction('CATEGORY_UPDATE', { categoryId: id, name, site: activeSite });
          } else {
              await addDoc(collection(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'categories'), catData);
              logAction('CATEGORY_CREATE', { name, site: activeSite });
          }
          setEditingType(null);
      } catch (error) {
          console.error("Error saving category:", error);
          alert("Failed to save event type.");
      }
  };

  const handleAddAction = (e) => {
      e.preventDefault();
      const label = e.target.actionLabel.value;
      const icon = e.target.actionIcon.value;
      const color = e.target.actionColor.value;

      setEditingType(prev => ({
          ...prev,
          actions: [...(prev.actions || []), { label, icon, color }]
      }));
      e.target.reset(); // Reset form fields after adding
  };

  const handleDeleteAction = (index) => {
      setEditingType(prev => ({
          ...prev,
          actions: prev.actions.filter((_, i) => i !== index)
      }));
  };

  const handleCommitActions = async () => {
      if (!editingType || !editingType.id) return;
      try {
          await updateDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'categories', editingType.id), {
              actions: editingType.actions
          });
          logAction('CATEGORY_ACTIONS_UPDATE', { categoryId: editingType.id, name: editingType.name, actionCount: editingType.actions.length, site: activeSite });
          alert("Actions saved to database!");
      } catch (error) {
          console.error("Error committing actions:", error);
          alert("Failed to save actions.");
      }
  };

  const handleDeleteEventType = async (id) => {
    if (window.confirm("WARNING: Deleting this type will break existing events that use it. Proceed?")) {
        try {
            await deleteDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'categories', id));
            logAction('CATEGORY_DELETE', { categoryId: id, site: activeSite });
        } catch (error) {
            console.error("Error deleting category:", error);
            alert("Failed to delete event type.");
        }
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
      try {
          // Update user directory
          await updateDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'userDirectory', userId), { role: newRole });
          // Update user private profile
          await updateDoc(doc(db, 'artifacts', APP_DATA_ID, 'users', userId, 'profile', 'data'), { role: newRole });
          logAction('USER_ROLE_UPDATE', { targetUserId: userId, newRole });
      } catch (error) {
          console.error("Error updating user role:", error);
          alert("Failed to update user role.");
      }
  };
  
  const handleRemoveUserAccess = async (userId) => {
    if (window.confirm("Are you sure you want to remove this user's access (set role to 'removed')?")) {
        try {
            // Set role to 'removed' in both places
            await updateDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'userDirectory', userId), { role: 'removed', site: 'removed' });
            await updateDoc(doc(db, 'artifacts', APP_DATA_ID, 'users', userId, 'profile', 'data'), { role: 'removed', site: 'removed' });
            logAction('USER_ACCESS_REMOVE', { targetUserId: userId });
        } catch (error) {
            console.error("Error removing user access:", error);
            alert("Failed to remove user access.");
        }
    }
  };

  const handleSaveConfig = async () => {
      const newOffset = appSettings.serverOffset;
      const newSeason = parseInt(appSettings.currentSeason) || 1; 

      await setDoc(doc(db, 'artifacts', APP_DATA_ID, 'public', 'data', 'settings', 'config'), { 
          serverOffset: newOffset,
          currentSeason: newSeason
      }, { merge: true });
      logAction('CONFIG_UPDATE', { serverOffset: newOffset, currentSeason: newSeason });
      alert("Configuration saved!");
  };

  // --- Filtered and Sorted Users ---
  const filteredUsers = allUsers.filter(u => 
      u.site === activeSite && // Filter by active site
      u.role !== 'removed' && // Exclude removed users
      (u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.alliance?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.planetNumber?.includes(searchTerm))
  ).sort((a, b) => {
      const valA = a[sortUserKey] || '';
      const valB = b[sortUserKey] || '';
      if (valA < valB) return -1;
      if (valA > valB) return 1;
      return 0;
  });
  
  // --- END ADMIN ACTIONS ---

// ------------------------------------------------------------------
// --- formatDayTime FUNCTION (Specific for Calendar Grid Cells) ---
// ------------------------------------------------------------------
  const formatDayTime = (event, calendarDay, mode = displayMode) => {
    const utcDate = new Date(event.start);
    let displayTime;

    if (mode === 'server') {
        const serverOffsetMs = appSettings.serverOffset * 3600000;
        const localOffsetMs = utcDate.getTimezoneOffset() * 60000;
        const serverTime = new Date(utcDate.getTime() + localOffsetMs + serverOffsetMs);

        // Check if event time falls on this calendar day based on server time
        if (serverTime.getDate() !== calendarDay.getDate() || serverTime.getMonth() !== calendarDay.getMonth() || serverTime.getFullYear() !== calendarDay.getFullYear()) {
            return null; 
        }

        displayTime = serverTime;
        
    } else { // Local Time
        // Check if event time falls on this calendar day based on local time
        if (utcDate.getDate() !== calendarDay.getDate() || utcDate.getMonth() !== calendarDay.getMonth() || utcDate.getFullYear() !== calendarDay.getFullYear()) {
             return null; 
        }
        
        displayTime = utcDate;
    }

    // NEW FIX: Return HH:MM format (24-hour time for cleaner calendar view) using the determined displayTime
    return displayTime.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false
    });
  };
// ------------------------------------------------------------------


  // --- Recurring Events Helper (for Calendar Grid) ---
  const getRecurringEventsForMonth = (events, year, month) => {
    const recurringInstances = []; 

    events.filter(e => e.recurrence && e.recurrence !== 'none').forEach(event => {
        const start = new Date(event.start);
        const eventDay = start.getDate();
        const eventDayOfWeek = start.getDay();
        
        // --- Get original event time components (FIXED) ---
        const originalHours = start.getHours();
        const originalMinutes = start.getMinutes();
        
        // Repeats until the end of the specified month/day or default to a year out
        let repeatsUntil = event.repeatsUntil ? new Date(event.repeatsUntil) : new Date(year + 1, 0, 1);
        
        // Loop through all days of the current month
        for (let day = 1; day <= getDaysInMonth(year, month); day++) {
            const currentDate = new Date(year, month, day);
            const currentDayOfWeek = currentDate.getDay();

            if (currentDate > repeatsUntil) continue;
            
            let isMatch = false;
            
            if (event.recurrence === 'daily') {
                isMatch = true;
            } else if (event.recurrence === 'weekly') {
                if (currentDayOfWeek === eventDayOfWeek) {
                    isMatch = true;
                }
            } else if (event.recurrence === 'monthly') {
                if (day === eventDay) {
                    isMatch = true;
                }
            }

            if (isMatch && currentDate >= start) {
                 // --- 🛑 CRITICAL FIX APPLIED HERE ---
                 // Creates a new Date object using the current year/month/day of the recurrence, 
                 // but applies the original event's time.
                 const instanceDate = new Date(year, month, day, originalHours, originalMinutes); // <--- FIX 2 APPLIED HERE
                 
                 const instance = {
                    ...event,
                    id: `${event.id}-${instanceDate.getTime()}`, 
                    start: instanceDate.toISOString(), // Use the newly constructed date with time
                    isRecurringInstance: true,
                 };
                 recurringInstances.push(instance);
            }
        }
    });

    return recurringInstances;
  };


  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = [];
  for (let i = 0; i < getFirstDayOfMonth(year, month); i++) days.push(null);
  for (let i = 1; i <= getDaysInMonth(year, month); i++) days.push(new Date(year, month, i));


  const standardEvents = events.filter(e => !e.recurrence || e.recurrence === 'none');

  const recurringEvents = React.useMemo(() => {
      if (!events)return [];
  return getRecurringEventsForMonth(events, year, month); 
  }, [events, year, month]);
  
  const getEventsForDay = React.useCallback((dateObj) => {
    const day = dateObj.getDate();
    const mon = dateObj.getMonth();
    const yr = dateObj.getFullYear();
    
    const all = [...standardEvents, ...(recurringEvents || [])];

    // The return statement must be inside this function body
    return all.filter(e => {
        const utcDate = new Date(e.start);
        
        if (displayMode === 'server') {
             const serverOffsetMs = appSettings.serverOffset * 3600000;
             const localOffsetMs = utcDate.getTimezoneOffset() * 60000;
             const serverTime = new Date(utcDate.getTime() + localOffsetMs + serverOffsetMs);

             return serverTime.getDate() === day && serverTime.getMonth() === mon && serverTime.getFullYear() === yr;

        } else {
             return utcDate.getDate() === day && utcDate.getMonth() === mon && utcDate.getFullYear() === yr;
        }
    }).sort((a,b) => new Date(a.start) - new Date(b.start));
    
  // 🛑 FIX: Added comma to separate dependencies
  }, [standardEvents, recurringEvents, displayMode, appSettings]);
  
 


   

  // State for current time display
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); 

    return () => clearInterval(timer);
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
          <div className="flex justify-center mb-6">
            {<div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-200"><CalendarIcon size={32} className="text-white" /></div>}
            </div>


          
          <h1 className="text-4xl font-bold text-center text-gray-800 mb-2">P70 Calendar</h1>
          <p className="text-center text-gray-500 mb-8">Please obtain an invite code to access</p>


          {authView === 'code' && (
            <div className="space-y-4">
              <Input placeholder="Enter Invite Code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} autoFocus />
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleValidateCode}>Verify Code</Button>
              <div className="text-center mt-4">
                 <span className="text-sm text-gray-500 cursor-pointer hover:underline hover:text-indigo-600" onClick={() => setAuthView('login')}>Already have an account? Login</span>
              </div>
            </div>
          )}


          {/* --- SIGN UP FORM --- */}
          {authView === 'signup' && (
            <form onSubmit={(e) => handleAuth(e, 'signup')} className="space-y-4"> 
              
              <div className="text-sm bg-green-50 text-green-700 p-3 rounded border border-green-200">
                Joining <strong>{pendingContext?.site}</strong> as <strong>{pendingContext?.role}</strong> (Uses left: {pendingContext?.usesRemaining === undefined || pendingContext?.usesRemaining === null ? 'Unlimited' : pendingContext.usesRemaining})
              </div>
              
              <Input name="name" label="In-Game Name" placeholder="Your name in-game" required /> 
              
              <div className="flex gap-4"> 
                  <Input 
                    name="planetNumber" 
                    type="text" 
                    label="Planet #"
                    placeholder="e.g. 42" 
                    maxLength={3} 
                    required 
                    className="text-center" 
                    containerClassName="w-1/2 !mb-0" 
                  />
                  <Input 
                    name="alliance" 
                    type="text" 
                    label="Alliance"
                    placeholder="e.g. ABC" 
                    maxLength={3} 
                    required 
                    className="text-center"
                    containerClassName="w-1/2 !mb-0" 
                  />
              </div>
              
              <Input name="email" type="email" label="Email" placeholder="Your email address" required />
              <Input name="password" type="password" label="Password" placeholder="A strong password" required />
              
              <Input name="discordUsername" type="text" label="Discord Username (Optional)" placeholder="e.g. username#1234" />
              
              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">Join Site</Button>
            </form>
          )}


          {authView === 'login' && (
            <form onSubmit={(e) => handleAuth(e, 'login')} className="space-y-4">
               <Input name="email" type="email" placeholder="Email" required />
               <Input name="password" type="password" placeholder="Password" required />
               <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700">Login</Button>
               <button type="button" onClick={() => setAuthView('code')} className="w-full text-sm text-gray-500 mt-2 hover:text-indigo-600">Back to Code</button>
            </form>
          )}
        </div>
      </div>
    );
  }


  const isAdmin = userData?.role === 'admin';
  const canEdit = userData?.role === 'admin' || userData?.role === 'leader';
  const userCustomColor = userData?.customColor || '#3b82f6';


  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden text-slate-800 font-sans">



<header className="h-16 border-b flex items-center justify-between px-6 bg-white shrink-0 z-20 shadow-sm">
    
    {/* 1. LEFT SECTION (Season, Site Dropdown, Welcome Text) */}
    <div className="flex items-center space-x-6">
       
        {/* S and Season Number */}
        <div className="flex items-center space-x-1 p-2 border rounded-lg bg-gray-50">
           <div className='text-xl font-bold text-black-800'>S</div>
           <div className='text-xl font-bold' style={{color: userCustomColor }}>{appSettings.currentSeason ||1}
           </div>
        </div>

        {/* Site Dropdown */}
        {isAdmin ? (
            <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
               <MapPin size={16} className="text-indigo-500" />
               <select
                   className="bg-transparent font-bold text-indigo-800 text-sm focus:outline-none cursor-pointer"
                   value={activeSite || ''}
                   onChange={(e) => setActiveSite(e.target.value)}
                 >
                     {availableSites
                        .filter(s => s.name && s.id)
                        .map(s => (
                           <option key={s.id} value={s.id}>{s.name}</option>
                        ))
                     }
                 </select>
            </div>
        ) : (
             <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                <MapPin size={16} className="text-indigo-500" />
                <span className="font-bold text-indigo-800 text-sm">{activeSite}</span>
             </div>
        )}

    </div>
    
    {/* 2. CENTER SECTION (Month/Year Controls) - Centered */}
    <div className="flex-1 flex justify-center"> {/* <-- CORRECTED: Added hyphen to 'justify-center' */}
        
        {/* Month/Year Navigation Component */}
        <div className="flex items-center space-x-2"> 
    
    <button 
        onClick={() => setCurrentDate(new Date(year, month - 1, 1))} 
        // Apply the custom color inline to the icon color (text color)
        className="p-1 hover:bg-gray-100 rounded-full transition" 
        style={{ color: userCustomColor }}
    >
        <ChevronLeft size={24}/>
    </button>
    
    <span className="text-center text-xl font-extrabold" style={{ color: userCustomColor }}>{MONTHS[month]} {year}</span> 
    
    <button 
        onClick={() => setCurrentDate(new Date(year, month + 1, 1))} 
        // Apply the custom color inline to the icon color (text color)
        className="p-1 hover:bg-gray-100 rounded-full transition" 
        style={{ color: userCustomColor }}
    >
        <ChevronRight size={24}/>
    </button>

</div>
    </div>
    
    {/* 3. RIGHT SECTION (Buttons: New Event, Settings, Logout) */}
    <div className="flex items-center space-x-4">
       
       {canEdit && <Button onClick={() => { setSelectedEvent(null); setIsEventModalOpen(true); }}className="p-3 rounded-full md:rounded-md flex items-center text-white hover:opacity-90 transition duration-150" 
        style={{ 
            backgroundColor: userCustomColor
        }}
    >
        <Plus size={20}/><span className="hidden md:inline ml-2">New Event</span>
    </Button>
}
       
       {isAdmin && <button onClick={() => setIsAdminOpen(true)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><Settings size={24} /></button>}
       <button onClick={() => signOut(auth)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full"><LogOut size={4} /></button>
    </div>
    
</header>


      <div className="flex flex-1 overflow-hidden">
        {/* --- Sidebar --- */}
        <aside 
            className="w-60 border-r hidden lg:flex flex-col p-6 overflow-y-auto" 
            style={{ backgroundColor: `${userCustomColor}1A` }}
        >
           
           {/* Local/Server Toggle with Current Time Display */}
         
           <div className="mb-6">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Display Time</h3>
                <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-semibold" style={{ backgroundColor: `${userCustomColor}15` }}>
                    <button 
                        onClick={() => setDisplayMode('local')} 
                        className={`px-2 py-1 rounded flex-1 ${displayMode==='local'?'bg-white shadow':'text-gray-500'}`}
                        style={{ color: displayMode === 'local' ? userCustomColor : '#6b7280' }}
                    > 

                        Local 
                        <div className="text-sm font-bold mt-1 tracking-wider">
                            {formatTime(currentTime.toISOString(), 'local', true, appSettings)}
                        </div> 
                    </button>
                    <button 
                        onClick={() => setDisplayMode('server')} 
                        className={`px-2 py-1 rounded flex-1 ${displayMode==='server'?'bg-white shadow':'text-gray-500'}`}
                        style={{ color: displayMode === 'server' ? userCustomColor : '#6b7280' }}
                    >
                        Server
                        <div className="text-sm font-bold mt-1 tracking-wider">
                            {formatTime(currentTime.toISOString(), 'server', true, appSettings)}
                        </div>
                    </button>   
                </div>
            </div>

            {/* Sidebar Tab Selector */}
            <div className="mb-4">
                <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-semibold">
                    <button 
                        onClick={() => setSidebarTab('upcoming')} 
                        className={`px-2 py-1 rounded flex-1 ${sidebarTab==='upcoming'?'bg-white shadow text-indigo-600':'text-gray-500'}`}
                    >
                        Upcoming
                    </button>
                    <button 
                        onClick={() => setSidebarTab('important')} 
                        className={`px-2 py-1 rounded flex-1 ${sidebarTab==='important'?'bg-white shadow text-red-600':'text-gray-500'}`}
                    >
                        Important
                    </button>   
                </div>
            </div>

            {/* Upcoming Events Container (Conditional Rendering) */}
           <div className="mb-8">
                {sidebarTab === 'upcoming' && (
                    <UpcomingEvents 
                        events={events} 
                        categories={eventTypes} 
                        formatTime={formatTime} 
                        setActiveEvent={(evt) => { setSelectedEvent(evt); setIsEventModalOpen(true); }}
                        displayMode={displayMode}
                        max={5} 
                        filterPriority={null} 
                        WAR_ICONS={WAR_ICONS}
                        CalendarIcon={CalendarIcon} // Passing CalendarIcon as prop
                        appSettings={appSettings} // Pass appSettings down
                    />
                )}
                
                {sidebarTab === 'important' && (
                    <UpcomingEvents 
                        events={events} 
                        categories={eventTypes} 
                        formatTime={formatTime} 
                        setActiveEvent={(evt) => { setSelectedEvent(evt); setIsEventModalOpen(true); }}
                        displayMode={displayMode}
                        max={5}
                        filterPriority={3} // Filter for Priority 3 events
                        WAR_ICONS={WAR_ICONS}
                        CalendarIcon={CalendarIcon} // Passing CalendarIcon as prop
                        appSettings={appSettings} // Pass appSettings down
                    />
                )}
            </div>


           {/* --- USER PROFILE (Clickable to Edit) --- */}
           <button onClick={() => { setIsUserEditModalOpen(true); setUserEditMessage({ type: null, text: '' }); }} className="mt-auto w-full text-left bg-white border p-4 rounded-xl shadow-sm hover:border-indigo-300 transition-colors">
               <div className="flex items-center gap-3 mb-2">
                   <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center font-bold" style={{ backgroundColor: `${userCustomColor}15`, color: userCustomColor }}>
                       {userData?.displayName?.[0] || 'U'}
                   </div>
                   <div>
                       <div className="text-sm font-bold text-gray-900">{userData?.displayName}</div>
                       <div className="text-xs text-gray-500 capitalize">{userData?.role}</div>
                   </div>
               </div>
               <div className="text-xs text-gray-400 border-t pt-2 mt-2">
                   Site: <span className="font-medium text-gray-700">{userData?.site}</span>
               </div>
           </button>
        </aside>


        <main className="flex-1 bg-white flex flex-col">
            <div 
                className="grid grid-cols-7 border-b" 
                style={{ backgroundColor: `${userCustomColor}1A` }}
            >
                {DAYS.map(day => <div key={day} className="py-2 text-center text-xs font-bold text-gray-400 uppercase">{day}</div>)}
            </div>
            <div className="flex-1 grid grid-cols-7 grid-rows-5 lg:grid-rows-6">
                {days.map((dateObj, idx) => {
                    if (!dateObj) return <div key={idx} className="bg-gray-50/30 border-b border-r" />;
                    
                    const dayEvents = getEventsForDay(dateObj);


                    return (
                        <div key={idx} className="border-b border-r p-1 hover:bg-gray-50 transition flex flex-col min-h-[80px] relative">
                            {/* UPDATED: Day Number in top-right corner */}
                            {dateObj && (
                                <div className={`absolute top-1 right-1 h-6 w-6 rounded-full text-sm font-semibold flex items-center justify-center z-10 ${dateObj.toDateString()===new Date().toDateString() ? 'bg-indigo-600 text-white' : 'text-gray-900'}`}>
                                    {dateObj.getDate()}
                                </div>
                            )}

                            {/* Increased margin top to account for number in the corner */}
                            <div className="mt-7 space-y-1 overflow-y-auto custom-scrollbar"> 
                                {dayEvents.map(evt => {
                                    const cat = eventTypes.find(c => c.id === evt.categoryId);
                                    
                                    // Handle recurring instance for selection/editing
                                    const originalEventId = evt.isRecurringInstance ? evt.id.split('-')[0] : evt.id;
                                    const eventToSelect = evt.isRecurringInstance ? events.find(e => e.id === originalEventId) : evt;

                                    const eventTimeDisplay = formatDayTime(evt, dateObj, displayMode);
                                    if (!eventTimeDisplay) return null; 
                                    
                                    const iconName = evt.icon || cat?.icon || null;
                                    const IconComponent = iconName ? WAR_ICONS[iconName] : null;
                                    const iconColor = evt.iconColor || cat?.iconColor || cat?.color || '#6366f1';

                                    return (
                                        <button 
                                            key={evt.id} 
                                            onClick={() => { setSelectedEvent(eventToSelect); setIsEventModalOpen(true); }} 
                                            className="w-full text-left p-1 rounded text-[10px] leading-tight text-white font-medium shadow-sm hover:opacity-80 relative" 
                                            style={{ backgroundColor: cat?.color || '#6366f1', color: cat?.labelColor || 'white' }}
                                        >
                                            <div className="flex flex-col">
                                                {/* Icon in top right of calendar tile */}
                                                {IconComponent && (
                                                    <div className='absolute top-0 right-0 p-1'>
                                                        <IconComponent size={10} style={{ color: iconColor, backgroundColor: cat?.color, borderRadius: '2px' }}/>
                                                    </div>
                                                )}
                                                {/* UPDATED: Display Name then Time (flex-col wraps automatically) */}
                                                <span className='text-xs font-bold truncate'>{evt.title}</span> 
                                                <span className='text-[10px]'>{eventTimeDisplay} {evt.isRecurringInstance && <span className="font-normal">(R)</span>}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </main>
      </div>


      {/* --- EVENT MODAL --- */}
      <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title={selectedEvent ? "Event Details" : "New Event"}>
        {canEdit ? (
            <form onSubmit={handleSaveEvent} className="space-y-4">
                <Input name="title" label="Title" defaultValue={selectedEvent?.title} required />
                
                <div className="grid grid-cols-3 gap-4">
                    <Input name="date" type="date" label="Date" defaultValue={selectedEvent?.start?.split('T')[0] || currentDate.toISOString().split('T')[0]} required />
                    
                    <Input name="time" type="time" label="Time" defaultValue={selectedEvent?.start ? new Date(selectedEvent.start).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}) : "09:00"} required />
                    <Select name="timeZone" label="Time Zone" defaultValue={selectedEvent?.timeZone || 'local'}>
                        <option value="local">Local Time</option>
                        <option value="server">Server Time (UTC {appSettings.serverOffset >= 0 ? '+' : ''}{appSettings.serverOffset})</option>
                    </Select>
                </div>
                
                <Select name="category" label="Event Type" defaultValue={selectedEvent?.categoryId}>
                    <option value="">None</option>
                    {eventTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                
                <div className="grid grid-cols-3 gap-4 items-end">
                    <Select name="icon" label="Event Icon" defaultValue={selectedEvent?.icon || '— No Icon —'} className="col-span-2">
                        {Object.keys(WAR_ICONS).map(iconName => (
                            <option key={iconName} value={iconName}>{iconName}</option>
                        ))}
                    </Select>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Icon Color</label>
                        <input type="color" name="iconColor" className="h-10 w-full border rounded cursor-pointer" defaultValue={selectedEvent?.iconColor || '#000000'} />
                    </div>
                </div>

                <Select name="duration" label="Duration (hours)" defaultValue={selectedEvent?.duration ? selectedEvent.duration / 60 : 24}>
                    <option value="1">1 hour</option>
                    <option value="2">2 hours</option>
                    <option value="3">3 hours</option>
                    <option value="6">6 hours</option>
                    <option value="12">12 hours</option>
                    <option value="24">24 hours (Full Day)</option>
                    {[4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map(h => (
                        <option key={h} value={h}>{h} hours</option>
                    ))}
                </Select>


                <div className="grid grid-cols-2 gap-4">
                    <Select name="recurrence" label="Repeats" defaultValue={selectedEvent?.recurrence || 'none'}>
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                    </Select>
                    <Input 
                        name="repeatsUntil" 
                        type="date" 
                        label="Repeats Until (Optional)" 
                        defaultValue={selectedEvent?.repeatsUntil} 
                    />
                </div>


                <div className="flex justify-end gap-2 mt-4">
                    {selectedEvent && <Button type="button" variant="danger" onClick={() => handleDeleteEvent(selectedEvent.id)}>Delete</Button>}
                    <Button type="submit">Save</Button>
                </div>
            </form>
        ) : (
            <div className="space-y-4">
                <h3 className="text-xl font-bold">{selectedEvent?.title}</h3>
                <div className="flex items-center gap-2 text-gray-600"><Clock size={16}/> {selectedEvent && formatTime(selectedEvent.start, displayMode, false, appSettings)}</div>
                <div className="flex items-center gap-2 text-gray-600"><Tag size={16}/> {eventTypes.find(c=>c.id===selectedEvent?.categoryId)?.name || 'No Category'}</div>
            </div>
        )}
      </Modal>


<Modal 
    isOpen={isUserEditModalOpen} 
    onClose={() => {setIsUserEditModalOpen(false); setProfileTab('general');}} // Reset tab on close
    title={`Edit Profile: ${userData?.displayName}`}
>
    
    {userEditMessage.text && (
        <div className={`p-3 mb-4 rounded-lg text-sm border ${userEditMessage.type === 'success' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'}`}>
            {userEditMessage.text}
        </div>
    )}
    
    {/* Tab Navigation */}
    <div className="flex border-b mb-4">
        <button 
            onClick={() => setProfileTab('general')} 
            className={`px-3 py-2 text-sm font-bold ${profileTab==='general' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
        >
            General Info
        </button>
        <button 
            onClick={() => setProfileTab('access')} 
            className={`px-3 py-2 text-sm font-bold ${profileTab==='access' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
        >
            Access Settings
        </button>
    </div>

    {/* Tab Content: General Info */}
    {profileTab === 'general' && (
        <form onSubmit={handleUpdateUserProfile} className="space-y-4">

          {/* LINE 1: In-Game Name (Non-Editable) */}
            <Input 
                name="displayName" 
                label="In-Game Name" 
                defaultValue={userData?.displayName || ''} 
                readOnly 
                className="bg-gray-100 cursor-not-allowed" 
            />
  
            {/* LINE 2: Planet # and Alliance (Combined) */}
           
            <div className="grid grid-cols-2 gap-4">
                <Input name="planetNumber" type="text" label="Planet #" defaultValue={userData?.planetNumber || ''} maxLength={3} required />
                <Input name="alliance" type="text" label="Alliance" defaultValue={userData?.alliance || ''} maxLength={3} required />
            </div>

            
            {/* LINE 3: Discord Username */}
            <Input name="discordUsername" type="text" label="Discord Username" defaultValue={userData?.discordUsername || ''} placeholder="Optional" />

            {/* LINE 4: Custom Theme Color */}
            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border">
                <label htmlFor="customColor" className="text-sm font-medium text-gray-700">Custom Theme Color</label>
                <input 
                    type="color" 
                    id="customColor"
                    name="customColor" 
                    className="h-8 w-16 border rounded cursor-pointer" 
                    defaultValue={userCustomColor} 
                />
            </div>

            <Button type="submit" className="w-full bg-indigo-600">Save Profile</Button>
        </form>
    )}

    {/* Tab Content: Access Settings (Uses the new component) */}
    {profileTab === 'access' && (
        <AccessSettingsTab 
            user={user} 
            userEditMessage={userEditMessage}
            handleUpdatePassword={handleUpdatePassword}
        />
    )}

</Modal>


      {/* --- ADMIN MODAL --- */}
      <Modal 
          isOpen={isAdminOpen} 
          onClose={() => { setIsAdminOpen(false); setEditingType(null); }} 
          title="Site Administration"
      >
         <div className="flex border-b mb-4">
            {['codes', 'types', 'users', 'templates', 'recurring', 'config', 'log'].map(t => (
                <button 
                    key={t} 
                    onClick={() => { setAdminTab(t); setEditingType(null); }} 
                    className={`px-3 py-2 text-sm font-bold capitalize ${adminTab===t ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400'}`}
                >
                    {t === 'types' ? 'Event Types' : t}
                </button>
            ))}
         </div>


         {/* -------------------------------------------------- */}
         {/* --- ADMIN TAB: CODES --- */}
         {/* -------------------------------------------------- */}
         {adminTab === 'codes' && (
             <div className="space-y-4">
                 <div className="text-sm text-gray-500 bg-indigo-50 p-2 rounded border border-indigo-100 font-semibold text-center">
                    Invite Codes for site: <span className='text-indigo-700'>{activeSite}</span>
                 </div>
                 <form onSubmit={createInviteCode} className="bg-gray-50 p-3 rounded-lg border space-y-2">
                     <h4 className="text-sm font-bold mb-2">Create Invite Code</h4>
                     <div className="grid grid-cols-2 gap-2">
                         <input name="siteName" placeholder="Site Name (e.g. Calendar)" className="p-2 border rounded text-sm" list="siteSuggestions" defaultValue={activeSite} required />
                         <datalist id="siteSuggestions">{availableSites.map(s => <option key={s} value={s} />)}</datalist>
                         
                         <select name="role" className="p-2 border rounded text-sm">
                             <option value="user">User</option>
                             <option value="leader">Leader</option>
                             <option value="admin">Admin</option>
                         </select>
                         <input name="maxUses" type="number" min="1" placeholder="Max Uses (e.g. 1)" defaultValue="1" className="p-2 border rounded text-sm" />
                     </div>
                     <Button type="submit" className="w-full text-sm bg-indigo-600">Generate Code</Button>
                 </form>
                 <div className="max-h-60 overflow-y-auto space-y-2">
                     {inviteCodes.filter(c => c.site === activeSite || !c.site).map(c => (
                         <div key={c.id} className="flex justify-between items-center p-2 border rounded text-sm">
                             <div>
                                 <span className="font-mono font-bold">{c.code}</span>
                                 <span className="mx-2 text-gray-400">|</span>
                                 <span className="font-semibold text-indigo-600">{c.site}</span>
                                 <span className="mx-2 text-gray-400">|</span>
                                 <span className="text-xs uppercase">{c.role}</span>
                             </div>
                             <div className='flex items-center gap-2'>
                                <span className={`text-[10px] px-2 py-0.5 rounded ${c.status==='active'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>
                                    Uses: {c.usesRemaining === undefined || c.usesRemaining === null ? '∞' : c.usesRemaining}
                                </span>
                                <button onClick={async () => { 
                                    await updateDoc(doc(db,'artifacts',APP_DATA_ID,'public','data','inviteCodes',c.id), { status: 'revoked', revokedAt: new Date().toISOString() });
                                    logAction('INVITE_CODE_REVOKE', { codeId: c.id, code: c.code });
                                }} 
                                className={`text-[10px] px-2 py-0.5 rounded ${c.status==='active'?'bg-red-100 text-red-700 hover:bg-red-200':'bg-gray-100 text-gray-500'}`} disabled={c.status !== 'active'}>
                                    Revoke
                                </button>
                             </div>
                         </div>
                     ))}
                 </div>
             </div>
         )}


         {/* ---------------------------------------------------------------------- */}
         {/* --- ADMIN TAB: EVENT TYPES (Updated with Icon fields) --- */}
         {/* ---------------------------------------------------------------------- */}
         {adminTab === 'types' && (
             <div className="space-y-4">
                 <div className="text-sm text-gray-500 bg-yellow-50 p-2 rounded">
                    Managing Event Types for site: <strong>{activeSite}</strong>
                 </div>
                 
                 {/* Event Type Creation/Edit Form */}
                 <form onSubmit={handleSaveEventType} className="bg-gray-50 p-4 rounded-lg border space-y-3">
                     <h4 className="text-sm font-bold">{editingType ? `Edit: ${editingType.name}` : 'Create New Event Type'}</h4>
                     <div className="grid grid-cols-4 gap-3 items-end">
                         <div className="col-span-4">
                            <Input name="typeName" label="Type Name" placeholder="Rally, Defense, Farm" defaultValue={editingType?.name || ''} required containerClassName="!mb-0"/>
                         </div>
                         <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">BG Color</label>
                            <input type="color" name="typeColor" className="h-10 w-full border rounded cursor-pointer" defaultValue={editingType?.color || '#6366f1'} />
                         </div>
                         <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Label Color</label>
                            <input type="color" name="typeLabelColor" className="h-10 w-full border rounded cursor-pointer" defaultValue={editingType?.labelColor || '#ffffff'} />
                         </div>
                         
                         <div className="col-span-2">
                            <Select name="typeIcon" label="Default Icon" defaultValue={editingType?.icon || '— No Icon —'}>
                                {Object.keys(WAR_ICONS).map(iconName => (
                                    <option key={iconName} value={iconName}>{iconName}</option>
                                ))}
                            </Select>
                         </div>
                         <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Icon Color</label>
                            <input type="color" name="typeIconColor" className="h-10 w-full border rounded cursor-pointer" defaultValue={editingType?.iconColor || '#000000'} />
                         </div>
                         <div className="col-span-4">
                            <Select name="typePriority" label="Priority (Higher = Above others)" defaultValue={editingType?.priority || 2}>
                                <option value="1">1 (Low)</option>
                                <option value="2">2 (Medium)</option>
                                <option value="3">3 (High / Important)</option>
                            </Select>
                         </div>
                     </div>
                     <Button type="submit" className="w-full text-sm bg-indigo-600">{editingType ? 'Save Type Details' : 'Create Event Type'}</Button>
                 </form>

                 {/* Action Management (Only visible when editing a type) */}
                 {editingType && (
                     <div className="bg-white p-4 rounded-lg border border-indigo-200 space-y-3">
                         <h4 className="text-sm font-bold flex justify-between items-center">
                            Actions/Labels (First action is used for Upcoming)
                            <Button onClick={handleCommitActions} variant="primary" className="text-xs py-1">Commit Actions</Button>
                         </h4>

                         {/* Add Action Form */}
                         <form onSubmit={handleAddAction} className="grid grid-cols-6 gap-2 p-2 bg-indigo-50 rounded-md">
                             <input name="actionLabel" placeholder="Label (e.g. Rally)" className="col-span-3 p-1 border rounded text-xs" required />
                             <select name="actionIcon" className="col-span-2 p-1 border rounded text-xs">
                                 {Object.keys(WAR_ICONS).filter(k => k !== '— No Icon —').map(iconName => (
                                     <option key={iconName} value={iconName}>{iconName}</option>
                                 ))}
                             </select>
                             <input type="color" name="actionColor" className="h-6 w-full border rounded cursor-pointer" defaultValue="#ff0000" />
                             <Button type="submit" className="text-xs p-1 col-span-6"><Plus size={16}/></Button>
                         </form>

                         {/* Current Actions List */}
                         <div className="max-h-24 overflow-y-auto space-y-1">
                             {editingType.actions.map((action, index) => {
                                 const IconComponent = WAR_ICONS[action.icon] || Tag;
                                 return (
                                     <div key={index} className="flex justify-between items-center p-2 border rounded bg-gray-50 text-xs">
                                         <div className="flex items-center gap-2 font-medium" style={{color: action.color}}>
                                            <IconComponent size={14} style={{color: action.color}}/>
                                            {action.label}
                                         </div>
                                         <button onClick={() => handleDeleteAction(index)} className="text-red-400 hover:text-red-600"><X size={14}/></button>
                                     </div>
                                 );
                             })}
                         </div>
                     </div>
                 )}


                 {/* Event Type List */}
                 <div className="space-y-2">
                     {eventTypes.map(t => {
                         const IconComponent = WAR_ICONS[t.icon] || Tag;
                         return (
                            <div key={t.id} className="flex justify-between items-center p-2 border rounded bg-white text-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full" style={{background:t.color}}></div>
                                    <IconComponent size={14} style={{color: t.iconColor || t.color}}/>
                                    <span className="font-bold">{t.name}</span>
                                    <span className="text-xs text-gray-500">| P:{t.priority} ({t.actions.length} Actions)</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="secondary" className="text-xs py-1" onClick={() => setEditingType(t)}>Edit</Button>
                                    <Button variant="danger" className="text-xs py-1" onClick={() => handleDeleteEventType(t.id)}>Delete</Button>
                                </div>
                            </div>
                         );
                     })}
                 </div>
             </div>
         )}


         {/* -------------------------------------------------- */}
         {/* --- ADMIN TAB: USERS --- */}
         {/* -------------------------------------------------- */}
         {adminTab === 'users' && (
            <div className='space-y-4'>
                 <div className="flex items-center gap-2">
                     <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Search Name, Alliance, or Planet #" 
                            className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:ring-indigo-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                     </div>
                     <Select value={sortUserKey} onChange={(e) => setSortUserKey(e.target.value)} className="w-auto !mb-0 text-sm">
                         <option value="planetNumber">Sort by Planet</option>
                         <option value="alliance">Sort by Alliance</option>
                         <option value="displayName">Sort by Name</option>
                     </Select>
                 </div>
                 <div className="max-h-96 overflow-y-auto space-y-2">
                     {filteredUsers.map(u => (
                         <div key={u.id} className="flex flex-col p-3 border rounded-lg bg-white shadow-sm">
                             <div className="flex justify-between items-center">
                                 <div className="flex items-center gap-3">
                                     <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">{u.planetNumber}</div>
                                     <div>
                                         <div className="text-sm font-bold">{u.displayName} <span className="text-xs font-mono text-gray-500">[{u.alliance}]</span></div>
                                         <div className="text-xs text-gray-500 capitalize">{u.role} on {u.site}</div>
                                     </div>
                                 </div>
                                 
                                 <div className="flex gap-2">
                                    <Select value={u.role} onChange={(e) => handleUpdateUserRole(u.id, e.target.value)} className="!mb-0 text-xs w-24">
                                        <option value="user">User</option>
                                        <option value="leader">Leader</option>
                                        <option value="admin">Admin</option>
                                        <option value="removed">Remove</option>
                                    </Select>
                                    <Button variant="danger" className="p-1" onClick={() => handleRemoveUserAccess(u.id)}><Trash2 size={16} /></Button>
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
            </div>
         )}


         
         {/* -------------------------------------------------- */}
         {/* --- ADMIN TAB: TEMPLATES --- */}
         {/* -------------------------------------------------- */}
         {adminTab === 'templates' && (
             <TemplateManager 
                templates={templates} 
                events={events} 
                eventTypes={eventTypes}
                activeSite={activeSite}
                WAR_ICONS={WAR_ICONS}
                onSave={handleSaveWeekTemplate}
                onDelete={handleDeleteTemplate}
                onApply={handleApplyTemplate} 
                canEdit={canEdit}
             />
         )}

         
         {/* -------------------------------------------------- */}
         {/* --- ADMIN TAB: RECURRING EVENTS (NEW TAB) --- */}
         {/* -------------------------------------------------- */}
         {adminTab === 'recurring' && (
             <RecurringEventManager 
                 recurringEventsList={events.filter(e => e.recurrence && e.recurrence !== 'none')}
                 onEdit={(evt) => { setSelectedEvent(evt); setIsEventModalOpen(true); }}
                 onDelete={handleDeleteEvent}
                 formatTime={formatTime}
             />
         )}

         {/* --- ADMIN TAB CONFIG --- */}
        {adminTab === 'config' && (
             <div>
                 <label className="block text-sm font-bold text-gray-700 mb-2">Global Server Offset (UTC)</label>
                 <input 
                     type="range" 
                     min="-12" 
                     max="14" 
                     className="w-full" 
                     value={appSettings.serverOffset} 
                     onChange={(e) => {
                        const newOffset = parseInt(e.target.value);
                        setAppSettings(prev => ({ ...prev, serverOffset: newOffset }));
                     }} 
                 />
                 <div className="text-center font-mono mt-2">UTC {appSettings.serverOffset >= 0 ? '+' : ''}{appSettings.serverOffset}</div>
                 
                 <div className="mt-6 border-t pt-4">
                     <Input 
                         label="Current Season Number"
                         type="number"
                         min="1"
                         defaultValue={appSettings.currentSeason}
                         onChange={(e) => setAppSettings(prev => ({ ...prev, currentSeason: e.target.value }))}
                     />
                 </div>
                 
                 <Button onClick={handleSaveConfig} className="w-full mt-4">Save Configuration</Button>
             </div>
         )}
         
         
        {/* --- ADMIN TAB LOG  --- */}
         {adminTab === 'log' && (
             <div className="space-y-4">
                 <h4 className="font-bold text-lg mb-2">Activity Log for {activeSite}</h4>
                 <div className="max-h-96 overflow-y-auto border rounded-lg bg-white p-3 space-y-2">
                    {activityLog.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).map(log => (
                        <div key={log.id} className="p-2 border-b text-xs">
                            <div className="flex justify-between items-start">
                                <span className="font-mono text-gray-700 text-[11px]">{log.timestamp.substring(11, 19)}</span>
                                <span className="font-bold uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-[10px]">{log.actionType.replace('_', ' ')}</span>
                            </div>
                            <div className="mt-1 text-gray-600">
                                <strong>{log.userName}</strong> ({log.role})
                                <p className="text-gray-500 truncate">{log.details}</p>
                            </div>
                        </div>
                    ))}
                    {activityLog.length === 0 && <div className="text-center text-gray-400 py-4">No recent activity logged for this site.</div>}
                 </div>
             </div>
         )}
      </Modal>


      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}