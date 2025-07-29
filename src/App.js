import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { Users, BarChart3, Calendar, PlusCircle, X, Briefcase, Mountain, ChevronLeft, ChevronRight, Edit, Trash2, UserPlus, Save, AlertTriangle, FileSpreadsheet, Trophy, LogOut, KeyRound, ShieldCheck, Cog, Bell, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

// Importações do Firebase
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, query, where, updateDoc } from "firebase/firestore";

// --- Configuração do Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyBjuptPqAa86wUvwMyR5lAJpoi8UuaK8IA",
  authDomain: "bonus-focus.firebaseapp.com",
  projectId: "bonus-focus",
  storageBucket: "bonus-focus.firebasestorage.app",
  messagingSenderId: "369112012231",
  appId: "1:369112012231:web:9547abd9c893e437f335e2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- COMPONENTES DE UI GENÉRICOS & UTILITÁRIOS ---
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
const getQuarter = (date) => Math.floor(date.getMonth() / 3) + 1;
const getMonthsForQuarter = (q) => {
    if (q === 1) return [0, 1, 2];
    if (q === 2) return [3, 4, 5];
    if (q === 3) return [6, 7, 8];
    if (q === 4) return [9, 10, 11];
    return [];
};

const parseDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') {
        return new Date(NaN);
    }
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
};
const Card = ({ children, className = '' }) => <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>{children}</div>;
const Button = ({ children, onClick, className = '', variant = 'primary', type = 'button', disabled = false }) => {
    const baseClasses = 'px-4 py-2 rounded-md font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
    const variants = {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        danger: 'bg-red-600 text-white hover:bg-red-700',
    };
    return <button type={type} onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]} ${className}`}>{children}</button>;
};
const IconButton = ({ children, onClick }) => <button onClick={onClick} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full">{children}</button>;


// --- LÓGICA DE CÁLCULO DE BÔNUS (HELPER) ---
const calculateMonthlyBonus = (collaboratorId, allEvaluations, businessDays, year, month) => {
    const myEvals = allEvaluations.filter(e => {
        const evalDate = parseDate(e.startDate);
        return e.collaboratorId === collaboratorId &&
               evalDate.getFullYear() === year &&
               evalDate.getMonth() === month;
    });

    let officeDaysWorked = 0;
    let fieldBonus = 0;
    const monthId = `${year}-${String(month + 1).padStart(2, '0')}`;
    const totalBusinessDays = businessDays[monthId]?.days || 22;

    const officeEvals = myEvals.filter(e => e.activityType === 'Escritório');
    let officePossiblePoints = 0;
    let officeObtainedPoints = 0;

    officeEvals.forEach(e => {
        const duration = (parseDate(e.endDate).getTime() - parseDate(e.startDate).getTime()) / 86400000 + 1;
        officeDaysWorked += duration;
        officePossiblePoints += duration * 3;
        officeObtainedPoints += duration * Object.values(e.criteria).reduce((a, b) => a + (b || 0), 0);
    });

    const officePerformancePercentage = officePossiblePoints > 0 ? (officeObtainedPoints / officePossiblePoints) * 100 : 0;
    let officeBonus = totalBusinessDays > 0 ? (officeDaysWorked / totalBusinessDays) * 200 : 0;

    if (officePerformancePercentage < 80) {
        officeBonus = 0;
    }

    const fieldEvals = myEvals.filter(e => e.activityType === 'Campo');
    const hasEquipmentFailureInMonth = fieldEvals.some(e => e.criteria.equipamento === 0);

    fieldEvals.forEach(e => {
        const allCriteriaMet = Object.values(e.criteria).every((v) => v === 1);
        if (allCriteriaMet) {
            const duration = (parseDate(e.endDate).getTime() - parseDate(e.startDate).getTime()) / 86400000 + 1;
            fieldBonus += duration * 60;
        }
    });

    if (hasEquipmentFailureInMonth) {
        fieldBonus = 0;
    }

    return { officeBonus, fieldBonus, totalBonus: officeBonus + fieldBonus, officeDaysWorked, totalBusinessDays, officeEvals: officeEvals.length, fieldEvals: fieldEvals.length };
};


// --- CONTEXTO GLOBAL DA APLICAÇÃO ---
const AppContext = createContext();

const AppProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);

    const [users, setUsers] = useState([]);
    const [collaborators, setCollaborators] = useState([]);
    const [evaluations, setEvaluations] = useState([]);
    const [businessDays, setBusinessDays] = useState({});
    const [notifications, setNotifications] = useState([]);
    const [confirmation, setConfirmation] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    
    const usersCollectionPath = `users`;
    const collaboratorsCollectionPath = `collaborators`;
    const evaluationsCollectionPath = `evaluations`;
    const businessDaysCollectionPath = `business_days`;
    const notificationsCollectionPath = `notifications`;

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setIsLoadingAuth(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (currentUser) {
            const userDocQuery = query(collection(db, usersCollectionPath), where("uid", "==", currentUser.uid));
            const unsubscribeProfile = onSnapshot(userDocQuery, (querySnapshot) => {
                if (!querySnapshot.empty) {
                    setUserProfile({id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data()});
                } else {
                    console.error("No profile found for logged-in user. Logging out.");
                    signOut(auth);
                }
            });

            const unsubUsers = onSnapshot(query(collection(db, usersCollectionPath)), snapshot => setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            const unsubCollabs = onSnapshot(query(collection(db, collaboratorsCollectionPath)), snapshot => setCollaborators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            const unsubEvals = onSnapshot(query(collection(db, evaluationsCollectionPath)), snapshot => setEvaluations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            const unsubBusinessDays = onSnapshot(query(collection(db, businessDaysCollectionPath)), snapshot => {
                const daysData = {};
                snapshot.forEach(doc => {
                    daysData[doc.id] = doc.data();
                });
                setBusinessDays(daysData);
            });
            const unsubNotifications = onSnapshot(query(collection(db, notificationsCollectionPath), where("recipientId", "==", userProfile?.id || "")), snapshot => setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            
            return () => {
                unsubscribeProfile();
                unsubUsers();
                unsubCollabs();
                unsubEvals();
                unsubBusinessDays();
                unsubNotifications();
            };
        } else {
            setUserProfile(null);
        }
    }, [currentUser, userProfile?.id]);

    const handleLogin = async (email, password) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            return { success: true };
        } catch (error) {
            return { success: false, message: "Credenciais inválidas." };
        }
    };

    const handleLogout = async () => await signOut(auth);

    const visibleCollaborators = useMemo(() => {
        if (!userProfile) return [];
        if (userProfile.role === 'admin' || userProfile.role === 'gerente') return collaborators;
        if (userProfile.role === 'manager') {
            const userTeams = Array.isArray(userProfile.team) ? userProfile.team : [userProfile.team];
            return collaborators.filter(c => userTeams.includes(c.team));
        }
        if (userProfile.role === 'collaborator') {
            return collaborators.filter(c => c.id === userProfile.collaboratorId);
        }
        return [];
    }, [userProfile, collaborators]);
    
    const handleSaveSystemUser = async (user) => {
        try {
            if (user.id) {
                const userRef = doc(db, usersCollectionPath, user.id);
                await updateDoc(userRef, { name: user.name, team: user.team, role: user.role });
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password);
                await setDoc(doc(db, usersCollectionPath, userCredential.user.uid), {
                    uid: userCredential.user.uid,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    team: user.role === 'manager' ? user.team : null,
                });
            }
        } catch (error) {
            console.error("Erro ao salvar utilizador do sistema:", error);
            alert("Erro ao salvar usuário: " + error.message);
        }
    };
    
    const handleSaveCollaborator = async (collaborator) => {
        try {
            const { id, ...collabData } = collaborator;
            if (id) {
                await setDoc(doc(db, collaboratorsCollectionPath, id), collabData);
            } else {
                await addDoc(collection(db, collaboratorsCollectionPath), collabData);
            }
        } catch (error) {
            console.error("Erro ao salvar colaborador:", error);
        }
    };
    
    const handleDeleteCollaborator = async (id) => {
        setConfirmation({
            isOpen: true,
            title: 'Excluir Colaborador',
            message: 'Tem certeza que deseja excluir este colaborador? Todas as suas avaliações também serão removidas.',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, collaboratorsCollectionPath, id));
                } catch (error) {
                    console.error("Erro ao deletar colaborador:", error);
                }
                setConfirmation({ isOpen: false });
            }
        });
    };

    const handleSaveEvaluation = async (evaluation) => {
        try {
            const { id, ...evalData } = evaluation;
            const evaluationWithManager = {
                ...evalData,
                managerName: userProfile?.name || 'Desconhecido',
                managerId: userProfile?.id || null,
                createdAt: new Date().toISOString()
            };
            
            if (id) {
                await setDoc(doc(db, evaluationsCollectionPath, id), evaluationWithManager);
            } else {
                await addDoc(collection(db, evaluationsCollectionPath), evaluationWithManager);
            }
        } catch (error) {
            console.error("Erro ao salvar avaliação:", error);
        }
    };

    const handleDeleteEvaluation = async (id) => {
        setConfirmation({
            isOpen: true,
            title: 'Excluir Avaliação',
            message: 'Tem certeza que deseja excluir esta avaliação?',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, evaluationsCollectionPath, id));
                } catch (error) {
                    console.error("Erro ao deletar avaliação:", error);
                }
                setConfirmation({ isOpen: false });
            }
        });
    };
    
    const handleCreateNotification = async (recipientId, title, message, type = 'info') => {
        try {
            await addDoc(collection(db, notificationsCollectionPath), {
                recipientId,
                title,
                message,
                type,
                read: false,
                createdAt: new Date().toISOString(),
                senderId: userProfile?.id || null,
                senderName: userProfile?.name || 'Sistema'
            });
        } catch (error) {
            console.error("Erro ao criar notificação:", error);
        }
    };
    
    const handleMarkNotificationAsRead = async (notificationId) => {
        try {
            await updateDoc(doc(db, notificationsCollectionPath, notificationId), { read: true });
        } catch (error) {
            console.error("Erro ao marcar notificação como lida:", error);
        }
    };

    const handleSaveBusinessDays = async (year, month, days) => {
        const docId = `${year}-${String(month + 1).padStart(2, '0')}`;
        try {
            await setDoc(doc(db, businessDaysCollectionPath, docId), { days: Number(days) });
        } catch (error) {
            console.error("Erro ao salvar dias úteis:", error);
        }
    };

    const value = {
        isAuthenticated: !!currentUser, 
        currentUser: userProfile, 
        isLoading: isLoadingAuth || (currentUser && !userProfile),
        users,
        collaborators: visibleCollaborators, 
        allCollaborators: collaborators, 
        evaluations,
        businessDays,
        notifications,
        handleLogin, 
        handleLogout,
        handleSaveSystemUser,
        handleSaveCollaborator,
        handleDeleteCollaborator,
        handleSaveEvaluation,
        handleDeleteEvaluation,
        handleSaveBusinessDays,
        handleCreateNotification,
        handleMarkNotificationAsRead,
        confirmation,
        setConfirmation
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// --- COMPONENTE PRINCIPAL & ROUTER ---
export default function App() {
    return (
        <AppProvider>
            <AppRouter />
        </AppProvider>
    );
}

function AppRouter() {
    const { isAuthenticated, isLoading } = useContext(AppContext);
    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p>Carregando Aplicação...</p></div>;
    }
    return isAuthenticated ? <AppContent /> : <LoginPage />;
}

// --- PÁGINA DE LOGIN ---
function LoginPage() {
    const { handleLogin } = useContext(AppContext);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoggingIn(true);
        const result = await handleLogin(email, password);
        if (!result.success) {
            setError(result.message || 'Ocorreu um erro.');
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="bg-gray-100 min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <Card className="shadow-2xl">
                    <div className="text-center mb-8">
                        <Trophy className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                        <h1 className="text-3xl font-bold text-gray-900">Focus Bonus App</h1>
                        <p className="text-gray-600">Por favor, faça login para continuar.</p>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm" placeholder="ex: admin@focus.com" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Senha</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm" placeholder="••••••••" required />
                        </div>
                        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                        <div>
                            <Button type="submit" className="w-full text-lg" disabled={!email || !password || isLoggingIn}>
                                {isLoggingIn ? 'Entrando...' : <><KeyRound size={20} /> Entrar</>}
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        </div>
    );
}

// --- CONTEÚDO PRINCIPAL DA APLICAÇÃO ---
function AppContent() {
    const { currentUser, confirmation, setConfirmation } = useContext(AppContext);
    
    const getInitialView = () => {
        if (currentUser.role === 'collaborator') return 'collaborator_view';
        return 'dashboard';
    };
    
    const [currentView, setCurrentView] = useState(getInitialView());
    const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
    const [editingEvaluation, setEditingEvaluation] = useState(null);
    const [evalModalProps, setEvalModalProps] = useState({ dateRange: { start: null, end: null }, collaboratorId: null });
    const [isCollaboratorModalOpen, setIsCollaboratorModalOpen] = useState(false);
    const [editingCollaborator, setEditingCollaborator] = useState(null);
    const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
    const [editingAccessUser, setEditingAccessUser] = useState(null);

    if (!currentUser) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p>Carregando Perfil...</p></div>;
    }

    return (
        <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
            <Header />
            <main className="p-4 sm:p-8 max-w-7xl mx-auto">
                <AppNavigator currentView={currentView} setCurrentView={setCurrentView} />
                {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'gerente') && currentView === 'dashboard' && <DashboardModule />}
                {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'gerente') && currentView === 'calendar' && <CalendarModule onLaunchEvalModal={(evalToEdit, dateRange, collaboratorId) => { setEditingEvaluation(evalToEdit); setEvalModalProps({dateRange, collaboratorId}); setIsEvalModalOpen(true); }} />}
                {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'gerente') && currentView === 'financial' && <FinancialModule />}
                {currentUser.role === 'gerente' && currentView === 'audit' && <AuditModule />}
                {currentUser.role === 'collaborator' && currentView === 'collaborator_view' && <CollaboratorViewModule />}
                {(currentUser.role === 'admin' || currentUser.role === 'gerente') && currentView === 'collaborators' && <CollaboratorManagementModule onLaunchCollaboratorModal={(user) => { setEditingCollaborator(user); setIsCollaboratorModalOpen(true); }} />}
                {currentUser.role === 'admin' && currentView === 'access' && <AccessControlModule onLaunchAccessModal={(user) => { setEditingAccessUser(user); setIsAccessModalOpen(true); }} />}
                {(currentUser.role === 'admin' || currentUser.role === 'gerente') && currentView === 'business_days' && <BusinessDaysModule />}
            </main>
            
            {isEvalModalOpen && <EvaluationModal isOpen={isEvalModalOpen} onClose={() => setIsEvalModalOpen(false)} {...evalModalProps} initialData={editingEvaluation} />}
            {isCollaboratorModalOpen && <CollaboratorModal isOpen={isCollaboratorModalOpen} onClose={() => setIsCollaboratorModalOpen(false)} initialData={editingCollaborator} />}
            {isAccessModalOpen && <AccessControlModal isOpen={isAccessModalOpen} onClose={() => setIsAccessModalOpen(false)} initialData={editingAccessUser} />}
            {confirmation.isOpen && <ConfirmationModal isOpen={confirmation.isOpen} onClose={() => setConfirmation({ isOpen: false })} onConfirm={confirmation.onConfirm} title={confirmation.title} message={confirmation.message} />}
        </div>
    );
}

// --- COMPONENTES DE NAVEGAÇÃO E CABEÇALHO ---
function Header() {
    const { currentUser, handleLogout, notifications, handleMarkNotificationAsRead } = useContext(AppContext);
    const [showNotifications, setShowNotifications] = useState(false);
    
    const unreadCount = notifications.filter(n => !n.read).length;
    
    const getTeamDisplay = () => {
        if (currentUser.role === 'admin') return 'Administrador';
        if (currentUser.role === 'collaborator') return 'Colaborador';
        if (currentUser.role === 'gerente') return 'Gerente';
        if (currentUser.role !== 'manager') return currentUser.role;
        
        const teams = Array.isArray(currentUser.team) ? currentUser.team : [currentUser.team];
        if (teams.length === 1) {
            return `Gestor - ${teams[0]}`;
        } else {
            return `Gestor - ${teams.length} equipes`;
        }
    };
    
    const handleNotificationClick = (notification) => {
        if (!notification.read) {
            handleMarkNotificationAsRead(notification.id);
        }
    };
    
    return (
        <header className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-blue-600" />
                    <h1 className="text-2xl font-bold text-gray-900">Focus Bonus App</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <button 
                            onClick={() => setShowNotifications(!showNotifications)}
                            className="relative p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full"
                        >
                            <Bell size={20} />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                    {unreadCount}
                                </span>
                            )}
                        </button>
                        
                        {showNotifications && (
                            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50 max-h-96 overflow-y-auto">
                                <div className="p-3 border-b">
                                    <h3 className="font-semibold">Notificações</h3>
                                </div>
                                {notifications.length === 0 ? (
                                    <div className="p-4 text-center text-gray-500">
                                        Nenhuma notificação
                                    </div>
                                ) : (
                                    <div className="divide-y">
                                        {notifications.map(notification => (
                                            <div 
                                                key={notification.id}
                                                onClick={() => handleNotificationClick(notification)}
                                                className={`p-3 cursor-pointer hover:bg-gray-50 ${!notification.read ? 'bg-blue-50' : ''}`}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <p className="font-medium text-sm">{notification.title}</p>
                                                        <p className="text-xs text-gray-600 mt-1">{notification.message}</p>
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            {new Date(notification.createdAt).toLocaleDateString('pt-BR')}
                                                        </p>
                                                    </div>
                                                    {!notification.read && (
                                                        <div className="w-2 h-2 bg-blue-500 rounded-full ml-2 mt-1"></div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="font-semibold">{currentUser.name}</p>
                        <p className="text-sm text-gray-500 capitalize">{getTeamDisplay()}</p>
                    </div>
                    <Button onClick={handleLogout} variant="secondary">
                        <LogOut size={16} /> Sair
                    </Button>
                </div>
            </div>
        </header>
    );
}

function AppNavigator({ currentView, setCurrentView }) {
    const { currentUser } = useContext(AppContext);
    const NavButton = ({ view, label, icon }) => (
        <button onClick={() => setCurrentView(view)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${currentView === view ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {icon} {label}
        </button>
    );
    return (
        <div className="mb-8 p-2 bg-white rounded-lg shadow-sm flex items-center flex-wrap gap-2">
            {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'gerente') && (
                <>
                    <NavButton view="dashboard" label="Dashboard" icon={<BarChart3 size={16}/>} />
                    <NavButton view="calendar" label="Lançamentos" icon={<Calendar size={16}/>} />
                    <NavButton view="financial" label="Financeiro" icon={<DollarSign size={16}/>} />
                </>
            )}
            {currentUser.role === 'gerente' && (
                <NavButton view="audit" label="Auditoria" icon={<AlertTriangle size={16}/>} />
            )}
            {currentUser.role === 'collaborator' && (
                <NavButton view="collaborator_view" label="Meus Dados" icon={<Users size={16}/>} />
            )}
            {(currentUser.role === 'admin' || currentUser.role === 'gerente') && (
                <>
                    <NavButton view="collaborators" label="Gerenciar Colaboradores" icon={<Users size={16}/>} />
                    <NavButton view="business_days" label="Dias Úteis" icon={<Cog size={16}/>} />
                </>
            )}
            {currentUser.role === 'admin' && (
                <NavButton view="access" label="Controle de Acesso" icon={<ShieldCheck size={16}/>} />
            )}
        </div>
    );
}

// --- MÓDULOS DE PÁGINA ---

function DashboardModule() {
    const { collaborators, evaluations } = useContext(AppContext);
    const [year, setYear] = useState(new Date().getFullYear());
    const [quarter, setQuarter] = useState(getQuarter(new Date()));

    const performanceData = useMemo(() => {
        if (!collaborators || collaborators.length === 0) return {};
        const data = {};
        collaborators.filter(c => c.team !== 'Campo').forEach(c => {
            data[c.name] = {};
            for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
                const monthEvals = evaluations.filter(e => {
                    const evalDate = parseDate(e.startDate);
                    return e.collaboratorId === c.id && 
                           evalDate.getFullYear() === year && 
                           evalDate.getMonth() === monthIndex && 
                           e.activityType === 'Escritório';
                });
                let possible = 0, obtained = 0;
                monthEvals.forEach(e => {
                    const duration = (parseDate(e.endDate).getTime() - parseDate(e.startDate).getTime()) / 86400000 + 1;
                    possible += duration * 3;
                    obtained += duration * Object.values(e.criteria).reduce((a, b) => a + (b || 0), 0);
                });
                data[c.name][monthIndex] = possible > 0 ? (obtained / possible) * 100 : null;
            }
        });
        return data;
    }, [collaborators, evaluations, year]);

    const quarterlyWinners = useMemo(() => {
        const teams = [...new Set(collaborators.filter(c => c.team !== 'Campo').map(c => c.team))];
        const winners = {};
        const months = getMonthsForQuarter(quarter);
        
        teams.forEach(team => {
            const teamMembers = collaborators.filter(c => c.team === team);
            let bestPerformer = null;
            let maxScore = -1;

            teamMembers.forEach(member => {
                const memberData = performanceData[member.name];
                if(!memberData) return;
                const isEligible = months.every(m => memberData[m] === null || memberData[m] > 80);
                
                if (isEligible) {
                    const quarterEvals = evaluations.filter(e => e.collaboratorId === member.id && parseDate(e.startDate).getFullYear() === year && months.includes(parseDate(e.startDate).getMonth()) && e.activityType === 'Escritório');
                    const score = quarterEvals.reduce((acc, e) => {
                        const duration = (parseDate(e.endDate).getTime() - parseDate(e.startDate).getTime()) / 86400000 + 1;
                        return acc + (duration * Object.values(e.criteria).reduce((a, b) => a + (b || 0), 0));
                    }, 0);

                    if (score > maxScore) {
                        maxScore = score;
                        bestPerformer = member.name;
                    }
                }
            });
            winners[team] = bestPerformer;
        });
        return winners;

    }, [collaborators, evaluations, performanceData, quarter, year]);

    const chartData = useMemo(() => {
        const data = [];
        for (let month = 0; month < 12; month++) {
            const monthName = new Date(year, month).toLocaleString('pt-BR', { month: 'short' });
            const entry = { name: monthName.replace('.','').toUpperCase() };
            Object.keys(performanceData).forEach(name => {
                const perf = performanceData[name][month];
                if (perf !== null) entry[name] = perf;
            });
            data.push(entry);
        }
        return data;
    }, [performanceData, year]);

    return (
        <div className="space-y-8">
            <Card>
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">Dashboard de Performance</h2>
                </div>
                <div className="flex gap-4 mt-4">
                    <select value={year} onChange={e => setYear(Number(e.target.value))} className="p-2 border rounded-md"><option>2024</option><option>2025</option></select>
                    <select value={quarter} onChange={e => setQuarter(Number(e.target.value))} className="p-2 border rounded-md">
                        <option value={1}>1º Trimestre</option><option value={2}>2º Trimestre</option>
                        <option value={3}>3º Trimestre</option><option value={4}>4º Trimestre</option>
                    </select>
                </div>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                    <h3 className="font-bold text-lg mb-4">Performance Mensal (%)</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-center">
                            <thead className="bg-gray-100"><tr><th className="p-2 text-left">Mês</th>{Object.keys(performanceData).map(name => <th key={name} className="p-2">{name}</th>)}</tr></thead>
                            <tbody>
                                {Array.from({length: 12}).map((_, month) => (
                                    <tr key={month} className="border-b"><td className="p-2 text-left font-semibold">{new Date(year, month).toLocaleString('pt-BR', {month: 'long'})}</td>
                                    {Object.keys(performanceData).map(name => {
                                        const perf = performanceData[name][month];
                                        const bgColor = perf === null ? 'bg-gray-100' : perf > 80 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
                                        return <td key={name} className={`p-2 font-semibold ${bgColor}`}>{perf !== null ? perf.toFixed(2)+'%' : '-'}</td>
                                    })}</tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
                <div className="space-y-8">
                    <Card>
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Trophy className="text-yellow-500"/> Ganhadores do Bônus Trimestral (Q{quarter})</h3>
                        <div className="space-y-2">
                            {Object.entries(quarterlyWinners).map(([team, name]) => (
                                <div key={team} className="p-3 bg-yellow-50 rounded-md">
                                    <p className="text-sm font-bold text-yellow-700">{team}</p>
                                    <p className="text-lg font-semibold">{name || 'Nenhum ganhador'}</p>
                                </div>
                            ))}
                        </div>
                    </Card>
                    <Card>
                        <h3 className="font-bold text-lg mb-4">Desempenho Mensal (Gráfico)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis unit="%" domain={[0, 120]}/>
                                <Tooltip />
                                <Legend />
                                {Object.keys(performanceData).map((name, i) => {
                                    const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088FE", "#00C49F"];
                                    return <Line key={name} type="monotone" dataKey={name} stroke={colors[i % colors.length]} />
                                })}
                            </LineChart>
                        </ResponsiveContainer>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function CalendarModule({ onLaunchEvalModal }) {
    const { collaborators } = useContext(AppContext);
    const [selectedCollaboratorId, setSelectedCollaboratorId] = useState(collaborators[0]?.id || null);
    const [currentDate, setCurrentDate] = useState(new Date());

    useEffect(() => {
        if (collaborators.length > 0 && !collaborators.find(c => c.id === selectedCollaboratorId)) {
            setSelectedCollaboratorId(collaborators[0]?.id || null);
        }
    }, [collaborators, selectedCollaboratorId]);

    if (collaborators.length === 0) {
        return <Card><p className="text-center">Nenhum colaborador para exibir.</p></Card>
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <CalendarView 
                    collaboratorId={selectedCollaboratorId} 
                    onLaunchEvalModal={onLaunchEvalModal} 
                    currentDate={currentDate} 
                    setCurrentDate={setCurrentDate} 
                />
            </div>
            <aside>
                <UserSelector collaborators={collaborators} selectedCollaboratorId={selectedCollaboratorId} setSelectedCollaboratorId={setSelectedCollaboratorId} />
                <ResultsDashboard collaboratorId={selectedCollaboratorId} currentDate={currentDate} />
            </aside>
        </div>
    );
}

function AccessControlModule({ onLaunchAccessModal }) {
    const { users } = useContext(AppContext);
    
    const getTeamDisplay = (user) => {
        if (user.role !== 'manager') return user.role;
        
        const teams = Array.isArray(user.team) ? user.team : [user.team];
        if (teams.length === 1) {
            return `${user.role} - ${teams[0]}`;
        } else {
            return `${user.role} - ${teams.join(', ')}`;
        }
    };
    
    return (
        <Card>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Controle de Acesso ao Sistema</h2>
                <Button onClick={() => onLaunchAccessModal(null)}><UserPlus size={16} /> Adicionar Gestor</Button>
            </div>
            <div className="space-y-3">
                {users.map(user => (
                    <div key={user.id} className="p-4 border rounded-lg flex justify-between items-center bg-gray-50">
                        <div>
                            <p className="font-bold text-lg">{user.name}</p>
                            <p className="text-sm text-gray-600">{user.email}</p>
                            <p className="text-xs font-semibold uppercase text-blue-600 mt-1">{getTeamDisplay(user)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <IconButton onClick={() => onLaunchAccessModal(user)}><Edit size={18} /></IconButton>
                            <IconButton onClick={() => alert('Delete user logic to be implemented')}><Trash2 size={18} className="text-red-500 hover:text-red-700" /></IconButton>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

function CollaboratorManagementModule({ onLaunchCollaboratorModal }) {
    const { allCollaborators, handleDeleteCollaborator } = useContext(AppContext);
    return (
        <Card>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Gerenciamento de Colaboradores</h2>
                <Button onClick={() => onLaunchCollaboratorModal(null)}><UserPlus size={16} /> Adicionar Colaborador</Button>
            </div>
            <div className="space-y-3">
                {allCollaborators.map(user => (
                    <div key={user.id} className="p-4 border rounded-lg flex justify-between items-center bg-gray-50">
                        <div><p className="font-bold text-lg">{user.name}</p><p className="text-sm text-gray-600">{user.team}</p></div>
                        <div className="flex items-center gap-3">
                            <IconButton onClick={() => onLaunchCollaboratorModal(user)}><Edit size={18} /></IconButton>
                            <IconButton onClick={() => handleDeleteCollaborator(user.id)}><Trash2 size={18} className="text-red-500 hover:text-red-700" /></IconButton>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

function BusinessDaysModule() {
    const { businessDays, handleSaveBusinessDays } = useContext(AppContext);
    const [year, setYear] = useState(new Date().getFullYear());
    const [days, setDays] = useState({});

    useEffect(() => {
        const yearData = {};
        for (let i = 0; i < 12; i++) {
            const monthId = `${year}-${String(i + 1).padStart(2, '0')}`;
            yearData[i] = businessDays[monthId]?.days || 22; // Default to 22
        }
        setDays(yearData);
    }, [year, businessDays]);

    const handleDayChange = (month, value) => {
        const newDays = { ...days, [month]: value };
        setDays(newDays);
    };

    const handleSave = (month) => {
        const value = days[month];
        handleSaveBusinessDays(year, month, value);
    };

    return (
        <Card>
            <h2 className="text-2xl font-bold mb-4">Configurar Dias Úteis</h2>
            <div className="flex items-center gap-4 mb-6">
                <label className="font-semibold">Ano:</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className="p-2 border rounded-md">
                    <option>2024</option>
                    <option>2025</option>
                    <option>2026</option>
                </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({length: 12}).map((_, i) => (
                    <div key={i} className="p-4 border rounded-lg">
                        <label className="font-bold text-lg">{new Date(year, i).toLocaleString('pt-BR', {month: 'long'})}</label>
                        <div className="flex items-center gap-2 mt-2">
                            <input 
                                type="number" 
                                value={days[i] || ''} 
                                onChange={e => handleDayChange(i, e.target.value)} 
                                className="w-full p-2 border rounded-md"
                            />
                            <Button onClick={() => handleSave(i)}><Save size={16}/></Button>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}


// --- SUB-COMPONENTES ---

function CalendarView({ collaboratorId, onLaunchEvalModal, currentDate, setCurrentDate }) {
    const { evaluations, handleDeleteEvaluation } = useContext(AppContext);
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const collaboratorEvaluations = useMemo(() => evaluations.filter(e => e.collaboratorId === collaboratorId), [evaluations, collaboratorId]);

    const handleDayClick = (day) => {
        const clickedDate = new Date(year, month, day);
        if (!startDate || (startDate && endDate)) {
            setStartDate(clickedDate);
            setEndDate(null);
        } else if (clickedDate < startDate) {
            setStartDate(clickedDate);
            setEndDate(null);
        } else {
            setEndDate(clickedDate);
        }
    };
    
    const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 15));
    const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 15));

    const getEvaluationsForDay = (day) => {
        const date = new Date(year, month, day);
        return collaboratorEvaluations.filter(e => {
            const start = parseDate(e.startDate);
            const end = parseDate(e.endDate);
            return start <= date && end >= date;
        });
    };
    
    const formatDate = (date) => date ? new Intl.DateTimeFormat('pt-BR').format(date) : '...';

    const isDateInRange = (day) => {
        if (!startDate) return false;
        const date = new Date(year, month, day);
        if (endDate) {
            return date >= startDate && date <= endDate;
        }
        return date.getTime() === startDate.getTime();
    }

    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                     <button onClick={handlePrevMonth} className="p-2 rounded-full hover:bg-gray-100"><ChevronLeft /></button>
                     <h2 className="text-xl font-bold text-center w-48">{currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}</h2>
                     <button onClick={handleNextMonth} className="p-2 rounded-full hover:bg-gray-100"><ChevronRight /></button>
                </div>
            </div>
             <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                 <div>
                     <p className="font-semibold text-blue-800">Selecione um período para avaliação:</p>
                     <p className="text-sm text-blue-700">Início: <span className="font-bold">{formatDate(startDate)}</span> | Fim: <span className="font-bold">{formatDate(endDate)}</span></p>
                 </div>
                 <Button onClick={() => onLaunchEvalModal(null, {start: startDate, end: endDate}, collaboratorId)} disabled={!startDate || !endDate}><PlusCircle size={16} /> Lançar Avaliação</Button>
             </div>
            <div className="grid grid-cols-7 gap-1 text-center font-semibold text-gray-600">{weekdays.map(day => <div key={day} className="py-2">{day}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, day) => {
                    const dayNumber = day + 1;
                    const dayEvaluations = getEvaluationsForDay(dayNumber);
                    const isInRange = isDateInRange(dayNumber);
                    
                    const hasNegativeEvaluation = dayEvaluations.some(evalItem => 
                        Object.values(evalItem.criteria).some(criterionValue => criterionValue === 0)
                    );

                    return (
                        <div key={dayNumber} onClick={() => handleDayClick(dayNumber)} className={`p-2 h-28 border rounded-md cursor-pointer transition-colors ${isInRange ? 'bg-blue-100 border-blue-300' : 'bg-white hover:bg-gray-100'} relative`}>
                            <span className="font-bold">{dayNumber}</span>
                            {hasNegativeEvaluation && (
                                <span className="absolute top-1 right-1 text-red-500 font-bold text-lg">X</span>
                            )}
                            <div className="mt-1 space-y-1 text-xs text-left">
                                {dayEvaluations.map(e => (
                                    <div key={e.id} className="p-1 rounded truncate relative group" style={{backgroundColor: e.activityType === 'Escritório' ? '#dcfce7' : '#ffedd5', color: e.activityType === 'Escritório' ? '#166534' : '#9a3412'}}>
                                        {e.csName}
                                        <div className="absolute z-10 hidden group-hover:flex items-center gap-1 right-1 top-0.5 bg-white/70 backdrop-blur-sm rounded-full px-1">
                                            <IconButton onClick={(evt) => {evt.stopPropagation(); onLaunchEvalModal(e, null, collaboratorId)}}><Edit size={12}/></IconButton>
                                            <IconButton onClick={(evt) => {evt.stopPropagation(); handleDeleteEvaluation(e.id)}}><Trash2 size={12}/></IconButton>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </Card>
    );
}

function UserSelector({ collaborators, selectedCollaboratorId, setSelectedCollaboratorId }) {
    return (
        <Card className="mb-6">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><Users className="w-5 h-5 text-gray-500" />Colaborador</h3>
            <select value={selectedCollaboratorId || ''} onChange={(e) => setSelectedCollaboratorId(e.target.value)} className="w-full p-2 border rounded-md bg-white">
                {collaborators.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
        </Card>
    );
}

function ResultsDashboard({ collaboratorId, currentDate }) {
    const { allCollaborators, evaluations, businessDays } = useContext(AppContext);
    
    const collaborator = allCollaborators.find(c => c.id === collaboratorId);
    
    const monthlyData = useMemo(() => {
        if (!collaboratorId) return { officeBonus: 0, fieldBonus: 0, officeDaysWorked: 0, totalBusinessDays: 0 };
        return calculateMonthlyBonus(collaboratorId, evaluations, businessDays, currentDate.getFullYear(), currentDate.getMonth());
    }, [collaboratorId, evaluations, businessDays, currentDate]);

    return (
        <Card>
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><BarChart3 /> Resumo de {currentDate.toLocaleDateString('pt-BR', { month: 'long' })}</h3>
            <p className="mb-4 text-sm font-semibold text-gray-700">Colaborador: {collaborator?.name || 'N/A'}</p>
            <div className="space-y-4">
                <div className="p-3 bg-green-50 rounded-lg"><p className="font-bold text-green-800">Bônus Escritório</p><p className="text-2xl font-bold text-green-700">R$ {monthlyData.officeBonus.toFixed(2)}</p><p className="text-sm text-green-600">{monthlyData.officeDaysWorked} de {monthlyData.totalBusinessDays} dias úteis trabalhados</p></div>
                <div className="p-3 bg-orange-50 rounded-lg"><p className="font-bold text-orange-800">Bônus Campo (Diárias)</p><p className="text-2xl font-bold text-orange-700">R$ {monthlyData.fieldBonus.toFixed(2)}</p><p className="text-sm text-orange-600">Valor acumulado no mês.</p></div>
                <div className="p-3 bg-blue-50 rounded-lg border-t-2 border-blue-200 mt-4"><p className="font-bold text-blue-800">Total Bônus no Mês</p><p className="text-3xl font-bold text-blue-700">R$ {(monthlyData.officeBonus + monthlyData.fieldBonus).toFixed(2)}</p></div>
            </div>
        </Card>
    );
}

// --- MODAIS ---

function ConfirmationModal({ isOpen, onClose, onConfirm, title, message }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
                    <h2 className="text-xl font-bold mb-2">{title}</h2>
                    <p className="text-gray-600 mb-6">{message}</p>
                    <div className="flex justify-center gap-4 w-full"><Button variant="secondary" onClick={onClose} className="w-full">Cancelar</Button><Button variant="danger" onClick={onConfirm} className="w-full">Confirmar</Button></div>
                </div>
            </Card>
        </div>
    );
}

function EvaluationModal({ isOpen, onClose, dateRange, initialData, collaboratorId }) {
    const { handleSaveEvaluation, allCollaborators } = useContext(AppContext);
    const [formData, setFormData] = useState(null);
    const [error, setError] = useState('');
    
    useEffect(() => {
        const defaultData = {
            startDate: dateRange?.start ? new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), dateRange.start.getDate()).toISOString().split("T")[0] : "",
            endDate: dateRange?.end ? new Date(dateRange.end.getFullYear(), dateRange.end.getMonth(), dateRange.end.getDate()).toISOString().split("T")[0] : "",
            activityType: "Escritório",
            csName: "",
            observation: "",
            criteria: { prazo: 1, qualidade: 1, apontamento: 1 },
            collaboratorId: collaboratorId
        };
        const dataToEdit = initialData ? { ...initialData } : defaultData;
        setFormData(dataToEdit);
    }, [initialData, dateRange, collaboratorId]);

    useEffect(() => {
        if (formData && formData.activityType) {
            let newCriteria = {};
            const currentCriteria = formData.criteria || {};
            if (formData.activityType === 'Escritório') {
                newCriteria = { prazo: currentCriteria.prazo ?? 1, qualidade: currentCriteria.qualidade ?? 1, apontamento: currentCriteria.apontamento ?? 1 };
            } else {
                newCriteria = { prazo: currentCriteria.prazo ?? 1, despesa: currentCriteria.despesa ?? 1, qualidade: currentCriteria.qualidade ?? 1, equipamento: currentCriteria.equipamento ?? 1 };
            }
            if (JSON.stringify(newCriteria) !== JSON.stringify(currentCriteria)) {
                setFormData(f => ({ ...f, criteria: newCriteria }));
            }
        }
    }, [formData?.activityType, formData?.criteria]);


    const handleSave = () => {
        if (!formData.csName.trim()) {
            setError('O nome da CS é obrigatório.');
            return;
        }
        handleSaveEvaluation(formData);
        onClose();
    };

    if (!isOpen || !formData) return null;
    const selectedCollaborator = allCollaborators.find(c => c.id === formData.collaboratorId);

    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
             <Card className="w-full max-w-lg my-8">
                 <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{initialData ? 'Editar' : 'Lançar'} Avaliação</h2><button onClick={onClose}><X className="text-gray-500" /></button></div>
                 <div className="space-y-4">
                     <div>
                         <label className="block text-sm font-medium text-gray-700">Colaborador</label>
                         <input type="text" value={selectedCollaborator?.name || ''} className="mt-1 block w-full p-2 border rounded-md bg-gray-100" disabled />
                     </div>
                     <p className="font-semibold bg-gray-100 p-2 rounded-md">Período: {new Date(formData.startDate+'T00:00:00').toLocaleDateString('pt-BR')} a {new Date(formData.endDate+'T00:00:00').toLocaleDateString('pt-BR')}</p>
                     <div><label className="block text-sm font-medium text-gray-700">Tipo de Atividade</label><div className="mt-1 grid grid-cols-2 gap-2"><button onClick={() => setFormData(f => ({...f, activityType: 'Escritório'}))} className={`p-3 rounded-md flex items-center justify-center gap-2 border-2 ${formData.activityType === 'Escritório' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}><Briefcase size={16}/> Escritório</button><button onClick={() => setFormData(f => ({...f, activityType: 'Campo'}))} className={`p-3 rounded-md flex items-center justify-center gap-2 border-2 ${formData.activityType === 'Campo' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}><Mountain size={16}/> Campo</button></div></div>
                     <div><label className="block text-sm font-medium text-gray-700">Nome da CS (Contrato)</label><input type="text" value={formData.csName} onChange={e => {setFormData(f => ({...f, csName: e.target.value})); setError('')}} className={`mt-1 block w-full p-2 border rounded-md ${error ? 'border-red-500' : 'border-gray-300'}`} />{error && <p className="text-red-500 text-xs mt-1">{error}</p>}</div>
                     <div><label className="block text-sm font-medium text-gray-700">Critérios</label>
                         <div className="mt-1 space-y-2 p-3 bg-gray-50 rounded-md">
                             {Object.entries(formData.criteria).map(([key, value]) => (
                                 <div key={key} className="flex justify-between items-center"><span className="capitalize font-medium text-gray-800">{key.replace('equipamento', 'equip./veículo')}</span><select value={value} onChange={e => setFormData(f => ({...f, criteria: {...f.criteria, [key]: Number(e.target.value)}}))} className="p-1 border rounded-md"><option value={1}>Sim</option><option value={0}>Não</option></select></div>
                             ))}
                         </div>
                     </div>
                     <div><label className="block text-sm font-medium text-gray-700">Observação (Opcional)</label><textarea value={formData.observation} onChange={e => setFormData(f => ({...f, observation: e.target.value}))} rows="2" className="mt-1 block w-full p-2 border rounded-md"></textarea></div>
                     <div className="flex justify-end gap-3"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={handleSave}><Save size={16}/> Salvar</Button></div>
                 </div>
             </Card>
         </div>
    );
}

function CollaboratorModal({ isOpen, onClose, initialData }) {
    const { handleSaveCollaborator } = useContext(AppContext);
    const [formData, setFormData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => { 
        setFormData(initialData ? { ...initialData } : { name: '', team: 'Projetos' }); 
    }, [initialData]);
    
    const handleChange = (field, value) => {
        setFormData(f => ({ ...f, [field]: value }));
        setError('');
    };

    const handleSave = () => { 
        if (!formData.name.trim()) {
            setError('O nome é obrigatório.');
            return;
        }
        handleSaveCollaborator(formData);
        onClose();
    };

    if (!isOpen || !formData) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">{initialData ? 'Editar' : 'Adicionar'} Colaborador</h2>
                    <IconButton onClick={onClose}><X /></IconButton>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nome Completo</label>
                        <input type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} className={`mt-1 block w-full p-2 border rounded-md ${error ? 'border-red-500' : 'border-gray-300'}`} />
                        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Equipe</label>
                        <select value={formData.team} onChange={e => handleChange('team', e.target.value)} className="mt-1 block w-full p-2 border rounded-md">
                            <option>Projetos</option>
                            <option>Laudos</option>
                            <option>Estudos</option>
                            <option>Automação</option>
                            <option>Campo</option>
                        </select>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave}><Save size={16}/> Salvar Colaborador</Button>
                </div>
            </Card>
        </div>
    );
}

function AccessControlModal({ isOpen, onClose, initialData }) {
    const { handleSaveSystemUser } = useContext(AppContext);
    const [formData, setFormData] = useState(null);

    useEffect(() => {
        const defaultTeams = initialData?.team ? (Array.isArray(initialData.team) ? initialData.team : [initialData.team]) : ['Projetos'];
        setFormData(initialData ? { ...initialData, team: defaultTeams } : { name: '', email: '', password: '', role: 'manager', team: ['Projetos'] });
    }, [initialData]);

    const handleChange = (field, value) => setFormData(f => ({ ...f, [field]: value }));
    
    const handleTeamToggle = (teamName) => {
        setFormData(f => {
            const currentTeams = f.team || [];
            const isSelected = currentTeams.includes(teamName);
            
            if (isSelected) {
                return { ...f, team: currentTeams.filter(t => t !== teamName) };
            } else {
                return { ...f, team: [...currentTeams, teamName] };
            }
        });
    };
    
    const handleSave = () => {
        handleSaveSystemUser(formData);
        onClose();
    };

    if (!isOpen || !formData) return null;

    const teams = ['Projetos', 'Laudos', 'Estudos', 'Automação', 'Campo'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">{initialData ? 'Editar' : 'Adicionar'} Usuário do Sistema</h2>
                    <IconButton onClick={onClose}><X /></IconButton>
                </div>
                <div className="space-y-4">
                    <div><label className="block text-sm font-medium">Nome Completo</label><input type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" /></div>
                    <div><label className="block text-sm font-medium">Email</label><input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" /></div>
                    <div><label className="block text-sm font-medium">Senha</label><input type="password" value={formData.password} onChange={e => handleChange('password', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" placeholder="Deixe em branco para não alterar"/></div>
                    <div><label className="block text-sm font-medium">Função</label><select value={formData.role} onChange={e => handleChange('role', e.target.value)} className="mt-1 block w-full p-2 border rounded-md"><option value="manager">Gestor</option><option value="gerente">Gerente</option><option value="collaborator">Colaborador</option><option value="admin">Administrador</option></select></div>
                    {formData.role === 'manager' && (
                        <div>
                            <label className="block text-sm font-medium mb-2">Equipes (selecione uma ou mais)</label>
                            <div className="space-y-2 p-3 bg-gray-50 rounded-md max-h-40 overflow-y-auto">
                                {teams.map(team => (
                                    <label key={team} className="flex items-center space-x-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={formData.team.includes(team)}
                                            onChange={() => handleTeamToggle(team)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700">{team}</span>
                                    </label>
                                ))}
                            </div>
                            {formData.team.length === 0 && (
                                <p className="text-red-500 text-xs mt-1">Selecione pelo menos uma equipe.</p>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-3 mt-8">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave} disabled={formData.role === 'manager' && formData.team.length === 0}><Save size={16}/> Salvar</Button>
                </div>
            </Card>
        </div>
    );
}


// --- MÓDULO DE VISUALIZAÇÃO DO COLABORADOR ---
function CollaboratorViewModule() {
    const { currentUser, allCollaborators, evaluations, businessDays } = useContext(AppContext);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    
    const collaborator = useMemo(() => {
        return allCollaborators.find(c => c.id === currentUser.collaboratorId);
    }, [currentUser, allCollaborators]);
    
    const monthlyData = useMemo(() => {
        const months = [];
        const currentEvalDate = new Date();
        
        for (let i = 11; i >= 0; i--) {
            const date = new Date(currentEvalDate.getFullYear(), currentEvalDate.getMonth() - i, 1);
            const year = date.getFullYear();
            const month = date.getMonth();
            
            const bonusData = collaborator ? calculateMonthlyBonus(collaborator.id, evaluations, businessDays, year, month) : { totalBonus: 0 };
            
            months.push({
                year,
                month,
                monthName: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
                totalBonus: bonusData.totalBonus,
                isPaid: false 
            });
        }
        
        return months.reverse();
    }, [evaluations, collaborator, businessDays]);
    
    const selectedMonthData = monthlyData.find(m => m.month === selectedMonth && m.year === selectedYear);
    
    if (!collaborator) {
        return <Card><p>Dados do colaborador não encontrados.</p></Card>
    }

    return (
        <div className="space-y-6">
            <Card>
                <h2 className="text-2xl font-bold mb-4">Meus Dados - {collaborator.name}</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-blue-800">Equipe</h3>
                        <p className="text-2xl font-bold text-blue-600">{collaborator.team}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-green-800">Total de Avaliações no Ano</h3>
                        <p className="text-2xl font-bold text-green-600">{evaluations.filter(e => e.collaboratorId === collaborator.id).length}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-purple-800">Bônus Total (Ano)</h3>
                        <p className="text-2xl font-bold text-purple-600">
                            R$ {monthlyData.reduce((sum, m) => sum + m.totalBonus, 0).toFixed(2)}
                        </p>
                    </div>
                </div>
            </Card>
            
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">Histórico Mensal</h3>
                    <div className="flex gap-2">
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="p-2 border rounded-md"
                        >
                            {Array.from({length: 12}, (_, i) => (
                                <option key={i} value={i}>
                                    {new Date(2024, i, 1).toLocaleDateString('pt-BR', { month: 'long' })}
                                </option>
                            ))}
                        </select>
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="p-2 border rounded-md"
                        >
                            <option value={2024}>2024</option>
                            <option value={2025}>2025</option>
                        </select>
                    </div>
                </div>
                
                {selectedMonthData && (
                     <ResultsDashboard collaboratorId={collaborator.id} currentDate={new Date(selectedYear, selectedMonth, 1)} />
                )}
            </Card>
        </div>
    );
}


// --- MÓDULO FINANCEIRO ---
function FinancialModule() {
    const { allCollaborators, evaluations, businessDays } = useContext(AppContext);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [paymentStatus, setPaymentStatus] = useState({});
    
    const monthlyFinancialData = useMemo(() => {
        const data = allCollaborators.map(collaborator => {
            const bonusData = calculateMonthlyBonus(collaborator.id, evaluations, businessDays, selectedYear, selectedMonth);
            return {
                ...collaborator,
                ...bonusData,
                isPaid: paymentStatus[`${collaborator.id}-${selectedYear}-${selectedMonth}`] || false
            };
        });
        
        return data.sort((a, b) => b.totalBonus - a.totalBonus);
    }, [allCollaborators, evaluations, businessDays, selectedYear, selectedMonth, paymentStatus]);

    const annualSummary = useMemo(() => {
        let totalPaidInYear = 0;
        allCollaborators.forEach(collaborator => {
            for (let month = 0; month <= 11; month++) {
                const { totalBonus } = calculateMonthlyBonus(collaborator.id, evaluations, businessDays, selectedYear, month);
                totalPaidInYear += totalBonus;
            }
        });

        const currentMonth = new Date().getFullYear() === selectedYear ? new Date().getMonth() : 11;
        const monthsPassed = currentMonth + 1;
        const projectedAnnual = totalPaidInYear > 0 ? (totalPaidInYear / monthsPassed) * 12 : 0;
        
        return { totalPaidInYear, projectedAnnual };
    }, [allCollaborators, evaluations, businessDays, selectedYear]);
    
    const teamSummary = useMemo(() => {
        const teams = {};
        monthlyFinancialData.forEach(collab => {
            if (!teams[collab.team]) {
                teams[collab.team] = { name: collab.team, totalAmount: 0 };
            }
            teams[collab.team].totalAmount += collab.totalBonus;
        });
        return Object.values(teams);
    }, [monthlyFinancialData]);
    
    const handlePaymentToggle = (collaboratorId) => {
        const key = `${collaboratorId}-${selectedYear}-${selectedMonth}`;
        setPaymentStatus(prev => ({ ...prev, [key]: !prev[key] }));
    };
    
    const totalMonthlyAmount = monthlyFinancialData.reduce((sum, collab) => sum + collab.totalBonus, 0);
    
    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Módulo Financeiro</h2>
                    <div className="flex gap-2">
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="p-2 border rounded-md"
                        >
                            {Array.from({length: 12}, (_, i) => (
                                <option key={i} value={i}>
                                    {new Date(selectedYear, i, 1).toLocaleDateString('pt-BR', { month: 'long' })}
                                </option>
                            ))}
                        </select>
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="p-2 border rounded-md"
                        >
                            <option value={2024}>2024</option>
                            <option value={2025}>2025</option>
                        </select>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-blue-800">Total do Mês</h3>
                        <p className="text-2xl font-bold text-blue-600">R$ {totalMonthlyAmount.toFixed(2)}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-green-800">Total Pago no Ano</h3>
                        <p className="text-2xl font-bold text-green-600">R$ {annualSummary.totalPaidInYear.toFixed(2)}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-purple-800">Projeção Anual</h3>
                        <p className="text-2xl font-bold text-purple-600">R$ {annualSummary.projectedAnnual.toFixed(2)}</p>
                    </div>
                </div>
            </Card>
            
            <Card>
                <h3 className="text-xl font-bold mb-4">Resumo por Equipe</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teamSummary.map(team => (
                        <div key={team.name} className="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
                            <h4 className="font-bold text-yellow-800 mb-2">{team.name}</h4>
                            <p className="text-lg font-semibold text-yellow-700">R$ {team.totalAmount.toFixed(2)}</p>
                        </div>
                    ))}
                </div>
            </Card>
            
            <Card>
                <h3 className="text-xl font-bold mb-4">Detalhamento por Colaborador</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-gray-50">
                                <th className="text-left p-3">Colaborador</th>
                                <th className="text-left p-3">Equipe</th>
                                <th className="text-right p-3">Bônus Escritório</th>
                                <th className="text-right p-3">Bônus Campo</th>
                                <th className="text-right p-3">Total</th>
                                <th className="text-center p-3">Avaliações (E|C)</th>
                                <th className="text-center p-3">Pagamento</th>
                            </tr>
                        </thead>
                        <tbody>
                            {monthlyFinancialData.map(collaborator => (
                                <tr key={collaborator.id} className="border-b hover:bg-gray-50">
                                    <td className="p-3 font-medium">{collaborator.name}</td>
                                    <td className="p-3">
                                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                                            {collaborator.team}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right">R$ {collaborator.officeBonus.toFixed(2)}</td>
                                    <td className="p-3 text-right">R$ {collaborator.fieldBonus.toFixed(2)}</td>
                                    <td className="p-3 text-right font-bold">R$ {collaborator.totalBonus.toFixed(2)}</td>
                                    <td className="p-3 text-center">
                                        <span className="text-xs text-gray-600">
                                            {collaborator.officeEvals} | {collaborator.fieldEvals}
                                        </span>
                                    </td>
                                    <td className="p-3 text-center">
                                        <Button
                                            variant={collaborator.isPaid ? "secondary" : "primary"}
                                            className="text-xs px-2 py-1"
                                            onClick={() => handlePaymentToggle(collaborator.id)}
                                        >
                                            {collaborator.isPaid ? '✓ Pago' : 'Marcar Pago'}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 bg-gray-100 font-bold">
                                <td colSpan="4" className="p-3 text-right">Total Geral do Mês:</td>
                                <td className="p-3 text-right text-lg">R$ {totalMonthlyAmount.toFixed(2)}</td>
                                <td colSpan="2" className="p-3"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Card>
        </div>
    );
}

// --- MÓDULO DE AUDITORIA ---
function AuditModule() {
    const { evaluations, users, allCollaborators, handleCreateNotification } = useContext(AppContext);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedEvaluation, setSelectedEvaluation] = useState(null);
    const [questionText, setQuestionText] = useState('');
    const [showQuestionModal, setShowQuestionModal] = useState(false);
    
    const negativeEvaluations = useMemo(() => {
        return evaluations.filter(evaluation => {
            const evalDate = parseDate(evaluation.startDate);
            const hasNegativeCriteria = Object.values(evaluation.criteria).some(value => value === 0);
            
            return evalDate.getFullYear() === selectedYear && 
                   evalDate.getMonth() === selectedMonth &&
                   hasNegativeCriteria;
        }).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    }, [evaluations, selectedYear, selectedMonth]);
    
    const handleQuestionManager = (evaluation) => {
        setSelectedEvaluation(evaluation);
        setQuestionText('');
        setShowQuestionModal(true);
    };
    
    const handleSendQuestion = async () => {
        if (!selectedEvaluation || !questionText.trim()) return;
        
        const manager = users.find(u => u.id === selectedEvaluation.managerId || u.name === selectedEvaluation.managerName);
        
        if (manager) {
            const collaboratorName = allCollaborators.find(c => c.id === selectedEvaluation.collaboratorId)?.name;
            await handleCreateNotification(
                manager.id,
                'Questionamento de Auditoria',
                `Sobre avaliação de ${collaboratorName} em ${new Date(selectedEvaluation.startDate + 'T00:00:00').toLocaleDateString('pt-BR')}: "${questionText}"`,
                'warning'
            );
            
            setShowQuestionModal(false);
            setSelectedEvaluation(null);
            setQuestionText('');
            
            alert('Questionamento enviado com sucesso!');
        } else {
            alert('Gestor não encontrado para envio da notificação.');
        }
    };
    
    const getCriteriaStatus = (criteria) => {
        const total = Object.keys(criteria).length;
        const negative = Object.values(criteria).filter(v => v === 0).length;
        return { total, negative, positive: total - negative };
    };
    
    return (
        <div className="space-y-6">
            <Card>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Auditoria de Avaliações</h2>
                    <div className="flex gap-2">
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                            className="p-2 border rounded-md"
                        >
                            {Array.from({length: 12}, (_, i) => (
                                <option key={i} value={i}>
                                    {new Date(2024, i, 1).toLocaleDateString('pt-BR', { month: 'long' })}
                                </option>
                            ))}
                        </select>
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="p-2 border rounded-md"
                        >
                            <option value={2024}>2024</option>
                            <option value={2025}>2025</option>
                        </select>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-red-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-red-800">Avaliações com Problemas</h3>
                        <p className="text-2xl font-bold text-red-600">{negativeEvaluations.length}</p>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-yellow-800">Colaboradores Afetados</h3>
                        <p className="text-2xl font-bold text-yellow-600">
                            {new Set(negativeEvaluations.map(e => e.collaboratorId)).size}
                        </p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-blue-800">Gestores Envolvidos</h3>
                        <p className="text-2xl font-bold text-blue-600">
                            {new Set(negativeEvaluations.map(e => e.managerName)).size}
                        </p>
                    </div>
                </div>
            </Card>
            
            <Card>
                <h3 className="text-xl font-bold mb-4">Avaliações com Critérios Negativos</h3>
                {negativeEvaluations.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <AlertTriangle size={48} className="mx-auto mb-4 text-gray-300" />
                        <p>Nenhuma avaliação com critérios negativos encontrada neste período.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {negativeEvaluations.map(evaluation => {
                            const criteriaStatus = getCriteriaStatus(evaluation.criteria);
                            const collaboratorName = allCollaborators.find(c => c.id === evaluation.collaboratorId)?.name || 'Desconhecido';
                            return (
                                <div key={evaluation.id} className="border rounded-lg p-4 bg-red-50 border-red-200">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="font-bold text-lg">{collaboratorName}</h4>
                                            <p className="text-sm text-gray-600">
                                                {evaluation.activityType} - {new Date(evaluation.startDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Avaliado por: {evaluation.managerName || 'Não informado'}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className="flex gap-2 mb-2">
                                                <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-semibold">
                                                    {criteriaStatus.negative} Não
                                                </span>
                                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-semibold">
                                                    {criteriaStatus.positive} Sim
                                                </span>
                                            </div>
                                            <Button
                                                variant="primary"
                                                className="text-xs"
                                                onClick={() => handleQuestionManager(evaluation)}
                                            >
                                                <AlertTriangle size={12} /> Questionar
                                            </Button>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        {Object.entries(evaluation.criteria).map(([criterion, value]) => (
                                            <div key={criterion} className={`p-2 rounded text-xs font-medium ${value === 1 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                <span className="block font-semibold">{criterion}</span>
                                                <span>{value === 1 ? 'Sim' : 'Não'}</span>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {evaluation.observation && (
                                        <div className="mt-3 p-2 bg-gray-100 rounded">
                                            <p className="text-sm"><strong>Observação:</strong> {evaluation.observation}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
            
            <Card>
                <h3 className="text-xl font-bold mb-4">Resumo por Gestor</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-gray-50">
                                <th className="text-left p-3">Gestor</th>
                                <th className="text-center p-3">Avaliações com Problemas</th>
                                <th className="text-center p-3">Colaboradores Afetados</th>
                                <th className="text-center p-3">Taxa de Problemas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(
                                negativeEvaluations.reduce((acc, evaluation) => {
                                    const manager = evaluation.managerName || 'Não informado';
                                    if (!acc[manager]) {
                                        acc[manager] = {
                                            name: manager,
                                            problemEvaluations: 0,
                                            totalEvaluations: 0,
                                            collaborators: new Set()
                                        };
                                    }
                                    acc[manager].problemEvaluations++;
                                    acc[manager].collaborators.add(evaluation.collaboratorId);
                                    return acc;
                                }, {})
                            ).map(([managerName, data]) => {
                                const totalEvaluations = evaluations.filter(e => {
                                    const evalDate = parseDate(e.startDate);
                                    return evalDate.getFullYear() === selectedYear && 
                                           evalDate.getMonth() === selectedMonth &&
                                           e.managerName === managerName;
                                }).length;
                                
                                const problemRate = totalEvaluations > 0 ? (data.problemEvaluations / totalEvaluations * 100) : 0;
                                
                                return (
                                    <tr key={managerName} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-medium">{managerName}</td>
                                        <td className="p-3 text-center">{data.problemEvaluations}</td>
                                        <td className="p-3 text-center">{data.collaborators.size}</td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${problemRate > 20 ? 'bg-red-100 text-red-800' : problemRate > 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                                {problemRate.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
            
            {showQuestionModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <Card className="w-full max-w-md">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">Questionar Gestor</h3>
                            <IconButton onClick={() => setShowQuestionModal(false)}>
                                <X />
                            </IconButton>
                        </div>
                        
                        {selectedEvaluation && (
                            <div className="mb-4 p-3 bg-gray-50 rounded">
                                <p className="font-medium">{allCollaborators.find(c => c.id === selectedEvaluation.collaboratorId)?.name}</p>
                                <p className="text-sm text-gray-600">
                                    {selectedEvaluation.activityType} - {new Date(selectedEvaluation.startDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </p>
                                <p className="text-sm text-gray-600">
                                    Gestor: {selectedEvaluation.managerName}
                                </p>
                            </div>
                        )}
                        
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">Questionamento:</label>
                            <textarea
                                value={questionText}
                                onChange={(e) => setQuestionText(e.target.value)}
                                className="w-full p-3 border rounded-md h-24 resize-none"
                                placeholder="Digite seu questionamento sobre esta avaliação..."
                            />
                        </div>
                        
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setShowQuestionModal(false)}>
                                Cancelar
                            </Button>
                            <Button 
                                variant="primary" 
                                onClick={handleSendQuestion}
                                disabled={!questionText.trim()}
                            >
                                Enviar Questionamento
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}