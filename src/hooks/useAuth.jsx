/** @format */
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export function useAuth() {
	const [fbUser, setFbUser] = useState(null);
	const [profile, setProfile] = useState(undefined); // { name, role, location }
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const unsub = onAuthStateChanged(auth, async (u) => {
			if (!u) {
				setFbUser(null);
				setProfile(null);
				setLoading(false);
				return;
			}
			setFbUser(u);
			try {
				const snap = await getDoc(doc(db, "users", u.uid));
				setProfile(snap.exists() ? snap.data() : null); // <- null if no doc
			} finally {
				setLoading(false);
			}
		});
		return () => unsub();
	}, []);

	return { fbUser, profile, loading };
}
